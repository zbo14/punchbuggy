const dgram = require('dgram')
const { once } = require('events')
const Client = require('./client')
const util = require('./util')

class UDPClient extends Client {
  constructor () {
    super(util.PROTOCOLS.UDP)

    this.handleDatagram = this.handleDatagram.bind(this)
  }

  isPeer (rinfo) {
    return (
      this.peerAddr === rinfo.address &&
      this.peerPort === rinfo.port
    )
  }

  handleDatagram (buf, rinfo) {
    const msg = util.decode(buf)
    this.handleMessage(msg, rinfo)
  }

  async createSocket () {
    const sock = dgram.createSocket('udp4')
    const promise = once(sock, 'listening')

    sock
      .on('message', this.handleDatagram)
      .bind()

    await promise

    return sock
  }

  removeListeners () {
    this.sock
      .removeListener('message', this.handleDatagram)
      .on('message', (buf, rinfo) => this.logInfo(buf.toString(), rinfo))
  }
}

module.exports = UDPClient
