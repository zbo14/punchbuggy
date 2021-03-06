const dgram = require('dgram')
const EventEmitter = require('events')
const tls = require('tls')
const util = require('./util')

/**
 * Class that communicates with rendezvous server to establish
 * UDP hole punching session with a remote peer.
 *
 * @extends EventEmitter
 */
class Client extends EventEmitter {
  constructor (sock) {
    super()

    this.setMaxListeners(1e3)

    this.dialed = false
    this.dialInterval = null
    this.nonce = 0
    this.localAddr = ''
    this.localPort = 0
    this.peerAddr = ''
    this.peerPort = 0
    this.peerSid = ''
    this.publicAddr = ''
    this.publicPort = 0
    this.serverAddr = ''
    this.serverPort = 0
    this.serverSock = null
    this.sid = ''
    this.udpSock = sock || null
  }

  /**
   * Establish a TCP connection to the rendezvous server
   * and create a UDP socket for later communication.
   *
   * @param  {String}       [addr = '127.0.0.1']
   * @param  {Number}       [port = 12435]
   *
   * @return {Promise}
   */
  async connectToServer (addr = '127.0.0.1', port = util.DEFAULT_PORT) {
    if (!util.isIPv4Address(addr)) {
      throw new Error('First argument must be an IPv4 address')
    }

    const sock = tls.connect(port, addr, { rejectUnauthorized: false })

    await Promise.all([
      EventEmitter.once(sock, 'connect'),
      this.createUDPSocket()
    ])

    util.receiveMessages(sock, (err, msg) => {
      /* istanbul ignore next */
      if (err) {
        this.handleError(err)
        return
      }

      try {
        this.handleServerMessage(msg)
      } catch (err) {
        this.handleError(err)
      }
    })

    this.serverAddr = addr
    this.serverPort = port
    this.serverSock = sock
  }

  /**
   * Request a unique ID from the server.
   *
   * @return {Promise}
   */
  async requestId () {
    await this.request(util.MESSAGES.ID_REQUEST)

    return this.sid
  }

  /**
   * Request a peer's remote info from the server.
   *
   * @param  {String}  sid
   *
   * @return {Promise}
   */
  async requestInfo (sid) {
    if (!this.sid) {
      throw new Error('Cannot send INFO_REQUEST before obtaining session id')
    }

    let body = Buffer.from(this.sid, 'base64')

    if (sid) {
      body = Buffer.concat([body, Buffer.from(sid, 'base64')])
    }

    const timeout = setTimeout(() => this.logInfo('Waiting for peer...'), 3e3)

    await this.request(util.MESSAGES.INFO_REQUEST, body, {
      isUDP: true,
      timeout: 60e3
    })

    clearTimeout(timeout)

    this.peerSid = sid || ''

    return {
      peerAddr: this.peerAddr,
      peerPort: this.peerPort,
      peerSid: this.peerSid,
      publicAddr: this.publicAddr,
      publicPort: this.publicPort
    }
  }

  /**
   * Send UDP messages to and receive messages from the peer.
   * Resolves when the server indicates that both peers have
   * received messages from each other.
   *
   * @return {Promise}
   */
  async dialPeer () {
    const sendDial = this.sendToPeer.bind(this, util.MESSAGES.DIAL)

    sendDial()

    this.dialInterval = setInterval(sendDial, util.RETRY_DELAY)

    const promise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), util.DIAL_TIMEOUT)
    })

    await Promise.race([
      EventEmitter.once(this, 'established'),
      promise
    ])

    this.serverSock.end()
  }

  async createUDPSocket () {
    if (!this.udpSock) {
      this.udpSock = dgram.createSocket('udp4')
      const promise = EventEmitter.once(this.udpSock, 'listening')

      this.udpSock.bind()

      await promise
    }

    this.udpSock.on('message', (buf, rinfo) => {
      try {
        const fromPeer = (
          this.peerAddr === rinfo.address &&
          this.peerPort === rinfo.port
        )

        if (!fromPeer) {
          throw new Error(`Unsolicited message from: addr=${rinfo.address}, port=${rinfo.port}`)
        }

        const msg = util.decode(buf)
        this.handlePeerMessage(msg)
      } catch (err) {
        if (err.message === util.INVALID_ENCODING) {
          err.message += ' from peer'
        }

        this.handleError(err)
      }
    })

    const { address, port } = this.udpSock.address()
    this.localAddr = address
    this.localPort = port

    this.logInfo(`My info: addr=${this.localAddr}, port=${this.localPort}`)
  }

  ejectUDPSocket () {
    return this.udpSock.removeAllListeners('message')
  }

  receive (timeout = util.RECEIVE_TIMEOUT) {
    const promise1 = EventEmitter
      .once(this, this.nonce)
      .then(([msg]) => msg)

    const promise2 = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Receive timeout')), timeout)
    })

    return Promise.race([promise1, promise2])
  }

  async request (type, body, { isUDP, timeout } = {}) {
    const promise = this.receive(timeout)
    const nonce = this.sendToServer(type, body, isUDP)

    const interval = isUDP && setInterval(() => {
      this.sendToServer(type, body, isUDP, nonce)
    }, util.RETRY_DELAY)

    const msg = await promise

    interval && clearInterval(interval)

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    return msg
  }

  sendToPeer (type, body) {
    util.send(this.udpSock, type, 0, body, this.peerPort, this.peerAddr)
  }

  sendToServer (type, body, isUDP = false, nonce = this.nonce++) {
    const sock = isUDP ? this.udpSock : this.serverSock
    util.send(sock, type, nonce, body, this.serverPort, this.serverAddr)

    if (this.nonce > util.MAX_UINT32) {
      this.nonce = 0
    }

    return nonce
  }

  handlePeerMessage (msg) {
    switch (msg.type) {
      case util.MESSAGES.DIAL: {
        this.handleDial(msg)
        break
      }

      default: {
        throw new Error(`Unexpected message from peer: code=${msg.code}, type=${msg.type}`)
      }
    }
  }

  handleServerMessage (msg) {
    switch (msg.type) {
      case util.MESSAGES.DIALED_RESPONSE: {
        this.handleDialedResponse(msg)
        break
      }

      case util.MESSAGES.ERROR: {
        break
      }

      case util.MESSAGES.ID_RESPONSE: {
        this.handleIdResponse(msg)
        break
      }

      case util.MESSAGES.INFO_RESPONSE: {
        this.handleInfoResponse(msg)
        break
      }

      default: {
        throw new Error(`Unexpected message from server: code=${msg.code}, type=${msg.type}`)
      }
    }

    this.emit(msg.nonce, msg)
  }

  /* istanbul ignore next */
  handleError (err) {
    util.log.error('[CLIENT]', err)
  }

  handleIdResponse (msg) {
    this.sid = msg.body.toString('base64')
    this.logInfo('Session ID:', this.sid)
  }

  handleInfoResponse (msg) {
    this.publicAddr = util.bufferToAddress(msg.body)
    this.publicPort = msg.body.readUint16BE(4)

    this.logInfo(`Public info: addr=${this.publicAddr}, port=${this.publicPort}`)

    if (msg.body.byteLength === util.CONTACT_LENGTH) {
      this.serverSock.end()
      return
    }

    this.peerAddr = util.bufferToAddress(msg.body.slice(util.CONTACT_LENGTH))
    this.peerPort = msg.body.readUint16BE(4 + util.CONTACT_LENGTH)

    this.logInfo(`Peer info: addr=${this.peerAddr}, port=${this.peerPort}`)
  }

  handleDial (msg) {
    if (this.dialed) return

    this.dialed = true
    this.sendToServer(util.MESSAGES.DIALED_REQUEST)
    this.logInfo('Peer dialed successfully')
  }

  handleDialedResponse (msg) {
    clearInterval(this.dialInterval)
    this.dialInterval = null

    this.emit('established')
    this.logInfo('Connection to peer established')
  }

  logInfo (...msgs) {
    util.log.info('[CLIENT]', ...msgs)
  }

  /* istanbul ignore next */
  logWarning (...msgs) {
    util.log.warning('[CLIENT]', ...msgs)
  }
}

module.exports = Client
