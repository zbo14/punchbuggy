const tls = require('tls')
const Server = require('./server')
const Session = require('./session')
const util = require('./util')

class TLSServer extends Server {
  constructor (opts) {
    super(util.PROTOCOLS.TLS, opts)
  }

  createSocket (opts) {
    return tls.createServer(opts)
      .on('secureConnection', this.handleSecureConnection.bind(this))
  }

  handleSecureConnection (sock) {
    const session = new Session(this, sock)
    this.logInfo(`Client \`${session.url}\``)
  }
}

module.exports = TLSServer
