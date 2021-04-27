const { once } = require('events')
const tls = require('tls')
const util = require('./util')

/**
 * @extends tls.Server
 */
class Server extends tls.Server {
  constructor (opts) {
    super(opts)

    this.clients = new Map()
    this.host = ''
    this.port = 0

    this
      .on('secureConnection', this.handleSecureConnection.bind(this))
      .on('error', this.logError.bind(this))
  }

  handleSecureConnection (sock) {
    const handleError = this.handleSocketError.bind(this, sock)
    const handleMessage = this.handleSocketMessage.bind(this, sock)

    util.receiveMessages(sock, handleError, handleMessage)
    this.sendYourPort(sock)
  }

  handleSocketError (sock, err) {
    this.logError(`From client \`${sock.remoteAddress}:${sock.remotePort}\` -`, err)
    sock.end()
  }

  handleSocketMessage (sock, msg) {
    const type = util.getMessageType(msg)

    switch (type) {
      case util.MESSAGES.INQUIRE_ABOUT: {
        return this.handleInquiry(sock, msg)
      }

      default: {
        const err = new Error('Unrecognized message code ' + type)
        this.handleSocketError(sock, err)
      }
    }
  }

  handleInquiry (sock, msg) {

  }

  logError (...msgs) {
    util.log.error('[SERVER]:', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[SERVER]:', ...msgs)
  }

  sendYourPort (sock) {
    const body = Buffer.alloc(3)

    body[0] = util.MESSAGE_CODES[util.MESSAGES.YOUR_PORT]
    body.writeUint16BE(sock.remotePort, 1)

    const msg = util.encode(body)

    sock.write(msg)
  }

  /**
   * Start the TLS server.
   *
   * @param  {Number} [port = 12435]
   * @param  {String} [host = '0.0.0.0']
   *
   * @return {Promise}
   */
  async start (port = util.DEFAULT_PORT, host = '0.0.0.0') {
    this.listen(port, host)

    await once(this, 'listening')

    this.host = host
    this.port = port

    this.logInfo(`Listening on \`${this.host}:${this.port}\``)
  }

  /**
   * Stop the TLS server.
   *
   * @return {Promise}
   */
  async stop () {
    this.close()

    await once(this, 'close')

    this.logInfo('Stopped')
  }
}

module.exports = Server
