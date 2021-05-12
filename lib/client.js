const dgram = require('dgram')
const EventEmitter = require('events')
const net = require('net')
const util = require('./util')

class Client extends EventEmitter {
  constructor (proto) {
    proto = proto.trim().toUpperCase()

    if (!util.PROTOCOLS[proto]) {
      throw new Error('Invalid protocol: ' + proto)
    }

    super()

    this.setMaxListeners(1e3)

    this.dialInterval = null
    this.localAddr = ''
    this.localPort = 0
    this.nonce = 0
    this.peerAddr = ''
    this.peerPort = 0
    this.peerSid = ''
    this.proto = proto
    this.serverAddr = ''
    this.serverPort = 0
    this.serverSock = null
    this.sid = ''
    this.tcpSock = null
    this.udpSock = null
    this.willInitiate = false
  }

  get isTCP () {
    return this.proto === util.PROTOCOLS.TCP
  }

  get isUDP () {
    return this.proto === util.PROTOCOLS.UDP
  }

  /**
   * @param  {String} addr
   * @param  {Number} [port = 12435]
   *
   * @return {Promise}
   */
  async connectToServer (addr, port = util.DEFAULT_PORT) {
    const sock = net.connect(port, addr)

    const promises = [
      EventEmitter.once(sock, 'connect'),
      this.isUDP && this.createUDPSocket()
    ].filter(Boolean)

    await Promise.all(promises)

    const handleError = this.handleError.bind(this)
    const handleMessage = this.handleServerMessage.bind(this)

    util.receiveMessages(sock, handleError, handleMessage)

    this.localAddr = sock.localAddress
    this.localPort = sock.localPort
    this.serverAddr = addr
    this.serverPort = port
    this.serverSock = sock
  }

  async createUDPSocket () {
    const sock = dgram.createSocket('udp4')
    const promise = EventEmitter.once(sock, 'listening')

    sock.on('message', (buf, rinfo) => {
      const fromPeer = (
        this.peerAddr === rinfo.address &&
        this.peerPort === rinfo.port
      )

      if (!fromPeer) return

      const msg = util.decode(buf)
      this.handlePeerMessage(msg)
    })

    sock.bind()

    await promise

    this.udpSock = sock
  }

  handlePeerMessage (msg) {
    switch (msg.type) {
      case util.MESSAGES.DIAL: {
        this.handleDial(msg)
        break
      }

      default: {
        const err = new Error(`Unexpected message from peer: code=${msg.code}, type=${msg.type}`)
        this.handleError(err)
        return
      }
    }
  }

  handleServerMessage (msg) {
    switch (msg.type) {
      case util.MESSAGES.CONNECT_RESPONSE: {
        this.handleConnectResponse(msg)
        break
      }

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

      default: {
        const err = new Error(`Unexpected message from server: code=${msg.code}, type=${msg.type}`)
        this.handleError(err)
        return
      }
    }

    this.emit(msg.nonce, msg)
  }

  handleError (err) {
    this.logError(err)
    this.end()
  }

  handleConnectResponse (msg) {
    this.peerAddr = util.bufferToAddress(msg.body)
    this.peerPort = msg.body.readUint16BE(4)
    this.willInitiate = this.isUDP || !!msg.body[6]
    this.logInfo(`Peer info: addr=${this.peerAddr}, port=${this.peerPort}`)
  }

  handleDial (msg) {
    this.sendToServer(util.MESSAGES.DIALED_REQUEST)
    this.emit('dialed')
    this.logInfo('Peer dialed successfully')
  }

  handleDialedResponse (msg) {
    if (this.dialInterval) {
      clearInterval(this.dialInterval)
      this.dialInterval = null
    }

    this.emit('established')
    this.logInfo('Connection to peer established')
  }

  handleIdResponse (msg) {
    this.sid = msg.body.toString('base64')
    this.logInfo('Session ID:', this.sid)
  }

  logError (...msgs) {
    util.log.error(`[${this.proto}-CLIENT]`, ...msgs)
  }

  logInfo (...msgs) {
    util.log.info(`[${this.proto}-CLIENT]`, ...msgs)
  }

  send (sock, type, body, nonce, port, addr) {
    util.send(sock, type, this.nonce++, body, port, addr)

    if (this.nonce > util.MAX_UINT32) {
     this.nonce = 0
    }
  }

  sendToPeer (type, body) {
    const sock = this.isTCP ? this.tcpSock : this.udpSock
    util.send(sock, type, 0, body, this.peerPort, this.peerAddr)
  }

  sendToServer (type, body, isUDP = false, nonce = this.nonce++) {
    const sock = isUDP ? this.udpSock : this.serverSock
    util.send(sock, type, nonce, body, this.serverPort, this.serverAddr)

    if (this.nonce > util.MAX_UINT32) {
     this.nonce = 0
    }

    return nonce
  }

  async dialPeer () {
    this.isTCP
      ? await this.dialPeerTCP()
      : await this.dialPeerUDP()
  }

  ejectSocket () {
    return this.isTCP
      ? this.ejectSocketTCP()
      : this.ejectSocketUDP()
  }

  ejectSocketTCP () {
    return this.tcpSock.removeAllListeners('data')
  }

  ejectSocketUDP () {
    return this.udpSock.removeAllListeners('message')
  }

  acceptInboundConnection () {
    return new Promise((resolve, reject) => {
      net
        .createServer()
        .on('connection', sock => {
          const fromPeer = (
            sock.remoteAddress === this.peerAddr &&
            sock.remotePort === this.peerPort
          )

          if (fromPeer) {
            this.tcpSock = sock
            resolve()
          }
        })
        .once('error', reject)
        .listen(this.localPort, this.localAddr)
    })
  }

  async attemptOutboundConnection () {
    const sock = net.connect({
      host: this.peerAddr,
      port: this.peerPort,
      localAddress: this.localAddr,
      localPort: this.localPort
    })

    await Promise.race([
      EventEmitter.once(sock, 'connect'),

      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Connect timeout')), util.CONNECT_TIMEOUT)
      })
    ])

    return sock
  }

  async makeOutboundConnection () {
    for (let i = 0; i < 10; i++) {
      try {
        this.tcpSock = await this.attemptOutboundConnection()
        return
      } catch {
        await util.sleep(1e3)
      }
    }

    throw new Error('Failed to make outbound connection')
  }

  async dialPeerTCP () {
    if (this.willInitiate) {
      await this.attemptOutboundConnection().catch(() => {})
      await this.acceptInboundConnection()
      this.logInfo('Accepted inbound connection')
      return
    }

    await this.makeOutboundConnection()
    this.logInfo('Made outbound connection')
  }

  async dialPeerUDP () {
    const sendDial = this.sendToPeer.bind(this, util.MESSAGES.DIAL)

    sendDial()

    this.dialInterval = setInterval(sendDial, util.RETRY_DELAY)

    const promise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), util.DIAL_TIMEOUT)
    })

    return Promise.race([
      EventEmitter.once(this, 'established'),
      promise
    ])
  }

  end () {

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

    return msg
  }

  /**
   * @param  {String}  sid
   *
   * @return {Promise}
   */
  async requestConnect (sid) {
    const body = Buffer.concat([
      Buffer.from(this.sid, 'base64'),
      Buffer.from(sid, 'base64')
    ])

    const promise = EventEmitter.once(this.serverSock, 'close')
    const timeout = setTimeout(() => this.logInfo('Waiting for peer...'), 1e3)

    const msg = await this.request(util.MESSAGES.CONNECT_REQUEST, body, {
      isUDP: this.isUDP,
      timeout: 60e3
    })

    clearTimeout(timeout)

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    this.peerSid = sid
    this.isTCP && await promise
  }

  /**
   * @return {Promise}
   */
  async requestId () {
    const msg = await this.request(util.MESSAGES.ID_REQUEST, this.proto)

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    return this.sid
  }
}

module.exports = Client
