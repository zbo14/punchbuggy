const dgram = require('dgram')
const { once } = require('events')
const net = require('net')
const Session = require('./session')
const util = require('./util')

class Server {
  constructor (opts) {
    this.addr = ''
    this.port = 0
    this.sessions = new Map()

    this.tcpServer = net.createServer()
      .on('connection', this.handleConnection.bind(this))
      .on('error', this.handleTCPServerError.bind(this))

    this.udpServer = dgram.createSocket('udp4')
      .on('message', this.handleDatagram.bind(this))
      .on('error', this.handleUDPServerError.bind(this))
  }

  deleteSession (session) {
    this.sessions.delete(session.id)
  }

  getSession (id) {
    return this.sessions.get(id)
  }

  setSession (session) {
    this.sessions.set(session.id, session)
  }

  logError (...msgs) {
    util.log.error('[SERVER]', ...msgs)
  }

  logInfo (...msgs) {
    util.log.info('[SERVER]', ...msgs)
  }

  handleConnection (sock) {
    new Session(this, sock)
  }

  handleDatagram (buf, rinfo) {
    const msg = util.decode(buf)

    if (msg.type !== util.MESSAGES.CONNECT_REQUEST) return

    const id = msg.body.slice(0, util.ID_LENGTH).toString('base64')
    const session = this.getSession(id)

    session && session.handleMessage(msg, rinfo)
  }

  handleTCPServerError (err) {
    this.logError('TCP Server', '>', err)
  }

  handleUDPServerError (err) {
    this.logError('UDP Server', '>', err)
  }

  /**
   * Start the server.
   *
   * @param  {Number} [port = 12435]
   * @param  {String} [addr = '0.0.0.0']
   *
   * @return {Promise}
   */
  async start (port = util.DEFAULT_PORT, addr = '0.0.0.0') {
    const promise = Promise.all([
      once(this.tcpServer, 'listening'),
      once(this.udpServer, 'listening')
    ])

    this.tcpServer.listen(port, addr)
    this.udpServer.bind(port, addr)

    await promise

    this.addr = addr
    this.port = port

    this.logInfo(`Listening on \`${this.addr}:${this.port}\``)
  }

  /**
   * End sessions and stop the server.
   *
   * @return {Promise}
   */
  async stop () {
    this.sessions.forEach(session => session.end())

    const promise = Promise.all([
      once(this.tcpServer, 'close'),
      once(this.udpServer, 'close')
    ])

    this.tcpServer.close()
    this.udpServer.close()

    this.logInfo('Stopped')
  }
}

module.exports = Server
