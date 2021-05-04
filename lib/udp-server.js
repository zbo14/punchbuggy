const dgram = require('dgram')
const Server = require('./server')
const Session = require('./session')
const util = require('./util')

class UDPServer extends Server {
  constructor () {
    super(util.PROTOCOLS.UDP)
  }

  createSocket () {
    return dgram.createSocket('udp4')
      .on('message', this.handleDatagram.bind(this))
  }

  handleDatagram (buf, rinfo) {
    const url = [
      util.PROTOCOLS.UDP.toLowerCase(),
      '://',
      rinfo.address,
      ':',
      rinfo.port
    ].join('')

    let session = this.getSession(url)

    if (!session) {
      session = new Session(this, this.sock, rinfo)
      this.logInfo(`Client \`${session.url}\``)
    }

    const msg = util.decode(buf)
    session.handleMessage(msg)
  }
}

module.exports = UDPServer
