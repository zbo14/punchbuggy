const tls = require('tls')
const Client = require('./client')
const util = require('./util')

class TLSClient extends Client {
  constructor () {
    super(util.PROTOCOLS.TLS)
  }

  isPeer (rinfo, sock) {
    return (
      this.peerAddr === sock.remoteAddress &&
      this.peerPort === sock.remotePort
    )
  }

  async createSocket (addr, port) {
    const promise = once(sock, 'secureConnect')
    const sock = tls.connect(port, addr, { rejectUnauthorized: false })

    await promise

    const handleError = this.handleError.bind(this, sock)
    const handleMessage = this.handleMessage.bind(this, sock)

    util.receiveMessages(sock, handleError, handleMessage)

    return sock
  }
}

module.exports = TLSClient
