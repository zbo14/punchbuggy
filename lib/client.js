const { once } = require('events')
const tls = require('tls')
const util = require('./util')

class Client {
  constructor () {
    this.delta = Infinity
    this.name = ''
    this.port = 0
    this.reject = null
    this.resolve = null
  }

  handleSocketError (sock, err) {
    this.logError(err)
    sock.end()
  }

  handleSocketMessage (sock, msg) {
    const type = util.getMessageType(msg)

    switch (type) {
      case util.MESSAGES.ERROR: {
        return this.handleError(sock, msg)
      }

      case util.MESSAGES.OK: {
        return this.handleOk(sock, msg)
      }

      case util.MESSAGES.YOUR_PORT: {
        return this.handleYourPort(sock, msg)
      }

      default: {
        const err = new Error(`Unexpected message (code=${msg[0]},type=${type})`)
        this.handleSocketError(sock, err)
      }
    }
  }

  handleError (sock, msg) {
    if (!this.reject) return

    const str = msg.slice(1).toString()
    const err = new Error(str)

    this.reject(err)

    this.resolve = null
    this.reject = null
  }

  handleOk (sock, msg) {
    if (!this.resolve) return

    this.resolve()

    this.resolve = null
    this.reject = null
  }

  handleYourPort (sock, msg) {
    const port = msg.readUint16BE(1)

    this.delta = Math.min(this.delta, port - this.port)
    this.port = port

    this.logInfo('External port:', port)
  }

  logError (...msgs) {
    util.log.error('[CLIENT]', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[CLIENT]', ...msgs)
  }

  resultPromise () {
    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

  async calculateDelta (host, port, iter = 5) {
    for (let i = 0; i < iter; i++) {
      await this.connect(host, port)
      this.sock.end()
      await util.sleep(100)
    }

    this.logInfo('Delta:', this.delta)
  }

  /**
   * @param  {String} host
   * @param  {Number} [port = 12435]
   *
   * @return {Promise}
   */
  async connect (host, port = util.DEFAULT_PORT) {
    const sock = tls.connect(port, host, { rejectUnauthorized: false })

    await once(sock, 'secureConnect')

    this.logInfo(sock.localAddress, sock.localPort, sock.remoteAddress, sock.remotePort)

    const handleError = this.handleSocketError.bind(this, sock)
    const handleMessage = this.handleSocketMessage.bind(this, sock)
    this.sock = sock

    util.receiveMessages(sock, handleError, handleMessage)

    this.logInfo(`Connected to server \`${sock.remoteAddress}:${port}\``)
  }

  /**
   * @param  {String} name
   *
   * @return {Promise}
   */
  async sendMyName (name) {
    if (!this.sock) {
      throw new Error('Not connected to server')
    }

    if (!name || typeof name !== 'string') {
      throw new Error('Name cannot be empty')
    }

    const body = Buffer.from(name)
    const promise = this.resultPromise()

    util.send(this.sock, util.MESSAGES.MY_NAME, body)

    await promise

    this.logInfo('Name:', name)
    this.name = name
  }
}

module.exports = Client
