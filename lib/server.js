const dgram = require('dgram')
const { once } = require('events')
const tls = require('tls')
const Session = require('./session')
const util = require('./util')

class Server {
  constructor (opts) {
    this.addr = ''
    this.port = 0
    this.sessionById = new Map()
    this.sessionByURL = new Map()

    this.tlsServer = tls.createServer(opts)
      .on('error', this.handleTLSServerError.bind(this))
      .on('secureConnection', this.handleTLSConnection.bind(this))

    this.udpServer = dgram.createSocket('udp4')
      .on('error', this.handleUDPServerError.bind(this))
      .on('message', this.handleDatagram.bind(this))
  }

  deleteSession (session) {
    session.id && this.sessionById.delete(session.id)
    this.sessionByURL.delete(session.url)
  }

  getSession (str) {
    try {
      const { href } = new URL(str)
      return this.sessionByURL.get(href)
    } catch {
      return this.sessionById.get(str)
    }
  }

  setSession (session) {
    session.id && this.sessionById.set(session.id, session)
    this.sessionByURL.set(session.url, session)
  }

  handleDatagram (buf, rinfo) {
    const url = 'udp://' + rinfo.address + ':' + rinfo.port
    let session = this.getSession(url)

    if (!session) {
      session = new Session(this, this.udpServer, rinfo)
      this.logInfo(`UDP session \`${session.url}\``)
    }

    const msg = util.decode(buf)
    session.handleMessage(msg)
  }

  handleUDPServerError (err) {
    this.logError('UDP listener', '>', err)
  }

  handleTLSConnection (sock) {
    const session = new Session(this, sock)
    this.logInfo(`TLS session \`${session.url}\``)
  }

  handleTLSServerError (err) {
    this.logError('TLS listener', '>', err)
  }

  logError (...msgs) {
    util.log.error('[SERVER]', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[SERVER]', ...msgs)
  }

  /**
   * Start the TLS server.
   *
   * @param  {Number} [port = 12435]
   * @param  {String} [addr = '0.0.0.0']
   *
   * @return {Promise}
   */
  async start (port = util.DEFAULT_PORT, addr = '0.0.0.0') {
    this.tlsServer.listen(port, addr)
    this.udpServer.bind(port, addr)

    await Promise.all([
      once(this.tlsServer, 'listening'),
      once(this.udpServer, 'listening')
    ])

    this.addr = addr
    this.port = port

    this.logInfo(`Listening on \`${this.addr}:${this.port}\``)
  }

  /**
   * End sessions and stop the TLS/UDP servers.
   *
   * @return {Promise}
   */
  async stop () {
    this.sessionByURL.forEach(session => session.end())
    this.tlsServer.close()
    this.udpServer.close()

    await Promise.all([
      once(this.tlsServer, 'close'),
      once(this.udpServer, 'close')
    ])

    this.logInfo('Stopped')
  }
}

module.exports = Server
