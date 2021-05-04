const EventEmitter = require('events')
const util = require('./util')

class Client extends EventEmitter {
  constructor (proto) {
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
    this.sid = ''
    this.sock = null
  }

  handleMessage (msg, rinfo, sock) {
    switch (msg.type) {
      case util.MESSAGES.DIAL: {
        this.handleDial(msg, rinfo)
        break
      }

      case util.MESSAGES.ERROR: {
        break
      }

      case util.MESSAGES.CONNECT_RESPONSE: {
        this.handleConnectResponse(msg)
        break
      }

      case util.MESSAGES.CONNECT_WAIT: {
        this.handleConnectWait(msg)
        break
      }

      case util.MESSAGES.ID_RESPONSE: {
        this.handleIdResponse(msg)
        break
      }

      default: {
        const err = new Error(`Unexpected message: code=${msg.code}, type=${msg.type}`)
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

  handleConnectWait (msg) {
    this.logInfo('Waiting for peer...')
  }

  handleIdResponse (msg) {
    this.sid = msg.body.toString('base64')
    this.logInfo('Session ID:', this.sid)
  }

  handleDial (msg, rinfo, sock) {
    if (!this.dialInterval || !this.isPeer(rinfo, sock)) return

    clearInterval(this.dialInterval)
    this.dialInterval = null

    this.emit('dialed')
    this.logInfo('Peer dialed successfully')
  }

  logError (...msgs) {
    util.log.error(`[${this.proto}-CLIENT]`, ...msgs)
  }

  logInfo (...msgs) {
    util.log.info(`[${this.proto}-CLIENT]`, ...msgs)
  }

  send (type, body, port, addr) {
    util.send(this.sock, type, this.nonce++, body, port, addr)

    if (this.nonce > util.MAX_UINT32) {
     this.nonce = 0
    }
  }

  sendToPeer (type, body) {
    this.send(type, body, this.peerPort, this.peerAddr)
  }

  sendToServer (type, body) {
    this.send(type, body, this.serverPort, this.serverAddr)
  }

  sendDial () {
    this.sendToPeer(util.MESSAGES.DIAL)
  }

  sendKeepAlive () {
    this.sendToPeer(util.MESSAGES.KEEP_ALIVE)
  }

  async createSocket () {
    throw new Error('Not implemented')
  }

  removeListeners () {
    throw new Error('Not implemented')
  }

  dial () {
    const promise = this.receive('dialed')

    this.sendDial()
    this.dialInterval = setInterval(this.sendDial.bind(this), 1e3)

    return promise
  }

  end () {
    throw new Error('Not implemented')
  }

  isPeer () {
    throw new Error('Not implemented')
  }

  receive (event = this.nonce) {
    const promise1 = EventEmitter.once(this, event)

    const promise2 = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Message timeout')), util.MESSAGE_TIMEOUT)
    })

    return Promise.race([promise1, promise2])
  }

  /**
   * @param  {String}  sid
   *
   * @return {Promise}
   */
  async requestConnect (sid) {
    const body = Buffer.from(sid, 'base64')
    const { nonce } = this
    const promise = this.receive()

    this.sendToServer(util.MESSAGES.CONNECT_REQUEST, body)

    let [msg] = await promise

    if (msg.type === util.MESSAGES.CONNECT_WAIT) {
      ([msg] = await this.receive(nonce))
    }

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    this.peerSid = sid
  }

  /**
   * @return {Promise}
   */
  async requestId () {
    const { nonce } = this
    this.sendToServer(util.MESSAGES.ID_REQUEST)

    const msg = await EventEmitter.once(this, nonce)

    if (msg.type === util.MESSAGES.ERROR) {
      throw new Error(msg.body.toString())
    }

    return this.sid
  }

  /**
   * @param  {String} addr
   * @param  {Number} [port = 12435]
   *
   * @return {Promise}
   */
  async start (addr, port = util.DEFAULT_PORT) {
    const sock = await this.createSocket()

    this.serverAddr = addr
    this.serverPort = port
    this.sock = sock
  }
}

module.exports = Client
