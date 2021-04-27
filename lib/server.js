const { once } = require('events')
const tls = require('tls')
const util = require('./util')

class Server {
  constructor (opts) {
    this.clients = new Map()
    this.host = ''
    this.port = 0

    this.tlsServer = tls.createServer(opts)
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

      case util.MESSAGES.MY_NAME: {
        return this.handleName(sock, msg)
      }

      default: {
        const err = new Error('Unrecognized message code ' + type)
        this.handleSocketError(sock, err)
      }
    }
  }

  handleInquiry (sock, msg) {

  }

  handleName (sock, msg) {
    const name = msg.slice(1).toString()

    if (!name) {
      const body = Buffer.from('Name cannot be empty')
      util.send(sock, util.MESSAGES.ERROR, body)
      return
    }

    if (this.clients.get(name)) {
      const body = Buffer.from('Name is already taken')
      util.send(sock, util.MESSAGES.ERROR, body)
      return
    }

    this.clients.set(name, sock)
    util.send(sock, util.MESSAGES.OK)
  }

  logError (...msgs) {
    util.log.error('[SERVER]', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[SERVER]', ...msgs)
  }

  sendYourPort (sock) {
    const body = Buffer.alloc(2)
    body.writeUint16BE(sock.remotePort)
    util.send(sock, util.MESSAGES.YOUR_PORT, body)
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
    this.tlsServer.listen(port, host)

    await once(this.tlsServer, 'listening')

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
