const { once } = require('events')
const tls = require('tls')
const util = require('./util')

class Client {
  constructor () {
    this.delta = Infinity
    this.port = 0
  }

  handleSocketError (sock, err) {
    this.logError(err)
    sock.end()
  }

  handleSocketMessage (sock, msg) {
    const type = util.getMessageType(msg)

    switch (type) {
      case util.MESSAGES.YOUR_PORT: {
        return this.handleYourPort(sock, msg)
      }

      default: {
        const err = new Error(`Unexpected message (code=${msg[0]},type=${type})`)
        this.handleSocketError(sock, err)
      }
    }
  }

  handleYourPort (sock, msg) {
    const port = msg.readUint16BE(1)

    this.delta = Math.min(this.delta, port - this.port)
    this.port = port

    this.logInfo('My port is ' + port)
  }

  logError (...msgs) {
    util.log.error('[CLIENT]:', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[CLIENT]:', ...msgs)
  }

  async calculateDelta (host, port, iter = 5) {
    const socks = []

    for (let i = 0; i < iter; i++) {
      const sock = await this.connect(host, port)

      socks.push(sock)
      await util.sleep(100)
    }

    this.logInfo('My delta is ' + this.delta)
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

    const handleError = this.handleSocketError.bind(this, sock)
    const handleMessage = this.handleSocketMessage.bind(this, sock)

    util.receiveMessages(sock, handleError, handleMessage)

    this.logInfo(`Connected to server \`${host}:${port}\``)

    return sock
  }
}

module.exports = Client
