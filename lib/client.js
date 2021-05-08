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
  }

  get isTCP () {
    return this.proto === util.PROTOCOLS.TCP
  }

  get isUDP () {
    return this.proto === util.PROTOCOLS.UDP
  }

  get prevNonce () {
    return this.nonce ? this.nonce - 1 : util.MAX_UINT32
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
    this.logInfo(`Peer info: addr=${this.peerAddr}, port=${this.peerPort}`)
  }

  handleDial (msg) {
    this.sendToServer(util.MESSAGES.DIALED_REQUEST)
    this.logInfo('Peer dialed successfully')
  }

  handleDialedResponse () {
    if (this.dialInterval) {
      clearInterval(this.dialInterval)
      this.dialInterval = null
    }

    this.emit('dialed')
    this.logInfo('Dial sequence complete')
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

  send (sock, type, body, port, addr) {
    util.send(sock, type, this.nonce++, body, port, addr)

    if (this.nonce > util.MAX_UINT32) {
     this.nonce = 0
    }
  }

  sendToPeer (type, body) {
    const sock = this.isTCP ? this.tcpSock : this.udpSock
    this.send(sock, type, body, this.peerPort, this.peerAddr)
  }

  sendToServer (type, body, isUDP = false) {
    const sock = isUDP ? this.udpSock : this.serverSock
    this.send(sock, type, body, this.serverPort, this.serverAddr)
  }

  async dial () {
    this.isTCP
      ? await this.dialTCP()
      : await this.dialUDP()
  }

  acceptInboundConnection () {
    const { localAddress, localPort } = this.serverSock
    const server = net.createServer()

    server.listen(localPort, localAddress)

    return new Promise((resolve, reject) => {
      server.on('connection', sock => {
        const fromPeer = (
          sock.remoteAddress === this.peerAddr &&
          sock.remotePort === this.peerPort
        )

        if (fromPeer) {
          resolve(sock)
          this.logInfo('Accepted inbound connection')
        }
      })
    })
  }

  async makeOutboundConnection () {
    for (let i = 0; i < 10; i++) {
      try {
        const sock = await new Promise((resolve, reject) => {
          const sock = net.connect(this.peerPort, this.peerAddr)
          sock.once('connect', () => resolve(sock))
          setTimeout(() => reject(new Error('Connect timeout')), util.CONNECT_TIMEOUT)
        })

        this.logInfo('Made outbound connection')

        return sock
      } catch {
        await new Promise(resolve => setTimeout(resolve, util.DIAL_DELAY))
      }
    }
  }

  async dialTCP () {
    const promise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), util.DIAL_TIMEOUT)
    })

    this.tcpSock = await Promise.race([
      this.acceptInboundConnection(),
      this.makeOutboundConnection(),
      promise
    ])

    await Promise.race([
      EventEmitter.once(this, 'dialed'),
      promise
    ])
  }

  async dialUDP () {
    const sendDial = this.sendToPeer.bind(this, util.MESSAGES.DIAL)

    sendDial()

    this.dialInterval = setInterval(sendDial, util.DIAL_DELAY)

    const promise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Dial timeout')), util.DIAL_TIMEOUT)
    })

    return Promise.race([
      EventEmitter.once(this, 'dialed'),
      promise
    ])
  }

  end () {

  }

  receive (event = this.nonce) {
    const promise1 = EventEmitter.once(this, event)
      .then(([msg]) => msg)

    const promise2 = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Receive timeout')), util.RECEIVE_TIMEOUT)
    })

    return Promise.race([promise1, promise2])
  }

  request (type, body, isUDP) {
    const promise = this.receive()

    this.sendToServer(type, body, isUDP)

    return promise
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

    const timeout = setTimeout(() => this.logInfo('Waiting for peer...'), 5e3)
    const msg = await this.request(util.MESSAGES.CONNECT_REQUEST, body, this.isUDP)

    clearTimeout(timeout)

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    this.peerSid = sid
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
