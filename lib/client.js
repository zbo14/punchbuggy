const dgram = require('dgram')
const EventEmitter = require('events')
const tls = require('tls')
const util = require('./util')

class Client extends EventEmitter {
  constructor () {
    super()

    this.setMaxListeners(1e3)

    this.nonce = 0
    this.serverAddr = ''
    this.serverPort = 0
    this.sid = null
    this.sock = null
  }

  handleMessage (msg) {
    switch (msg.type) {
      case util.MESSAGES.ERROR: {
        this.handleError(msg)
        break
      }

      case util.MESSAGES.CONNECT_RESPONSE: {
        this.handleConnectResponse(msg)
        break
      }

      case util.MESSAGES.ID_RESPONSE: {
        this.handleIdResponse(msg)
        break
      }

      default: {
        const err = new Error(`Unexpected message (code=${msg[0]},type=${type})`)
        this.handleError(sock, err)
        return
      }
    }

    this.emit(msg.nonce, msg)
  }

  handleError (err) {
    if (!(err instanceof Error)) {
      err = new Error(err.body.toString())
    }

    this.logError(err)
  }

  handleConnectResponse (msg) {}

  handleIdResponse (msg) {
    this.sid = msg.body
    this.logInfo('Session ID:', this.sid.toString('base64'))
  }

  logError (...msgs) {
    util.log.error('[CLIENT]', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[CLIENT]', ...msgs)
  }

  send (type, body) {
   util.send(this.sock, type, this.nonce++, body, this.serverPort, this.serverAddr)

   if (this.nonce > util.MAX_UINT32) {
     this.nonce = 0
   }
  }

  /**
   * @return {Promise}
   */
  async requestId () {
    const { nonce } = this
    this.send(util.MESSAGES.ID_REQUEST)

    const [msg] = await EventEmitter.once(this, nonce)

    return msg.body
  }

  /**
   * @param  {String} addr
   * @param  {Number} [port = 12435]
   * @param  {String} [proto = 'udp']
   *
   * @return {Promise}
   */
  async start (addr, port = util.DEFAULT_PORT, proto = util.PROTOCOLS.UDP) {
    this.serverAddr = addr
    this.serverPort = port

    if (proto === util.PROTOCOLS.UDP) {
      this.startUDP()
      return
    }

    await this.startTLS()
  }

  async startTLS () {
    const sock = tls.connect(this.serverPort, this.serverAddr, { rejectUnauthorized: false })

    await once(sock, 'secureConnect')

    const handleError = this.handleSocketError.bind(this, sock)
    const handleMessage = this.handleSocketMessage.bind(this, sock)
    this.sock = sock

    util.receiveMessages(sock, handleError, handleMessage)

    this.logInfo(`Established secure connection to server \`${this.serverAddr}:${this.serverPort}\``)
  }

  startUDP () {
    this.sock = dgram.createSocket('udp4').on('message', buf => {
      const msg = util.decode(buf)
      this.handleMessage(msg)
    })

    this.logInfo('Created UDP socket')
  }
}

module.exports = Client
