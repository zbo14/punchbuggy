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

  /* istanbul ignore next */
  handleError (...msgs) {
    util.log.error('[SERVER]', ...msgs)
  }

  /* istanbul ignore next */
  handleTCPServerError (err) {
    this.handleError('TCP Server', '>', err)
  }

  /* istanbul ignore next */
  handleUDPServerError (err) {
    this.handleError('UDP Server', '>', err)
  }

  /* istanbul ignore next */
  logInfo (...msgs) {
    util.log.info('[SERVER]', ...msgs)
  }

  handleConnection (sock) {
    new Session(this, sock)
  }

  handleDatagram (buf, rinfo) {
    try {
      const msg = util.decode(buf)

      if (msg.type !== util.MESSAGES.CONNECT_REQUEST) {
        throw new Error(`Unexpected message: code=${msg.code}, type=${msg.type} from: addr=${rinfo.address}, port=${rinfo.port}`)
      }

      const id = msg.body.slice(0, util.ID_LENGTH).toString('base64')
      const session = this.getSession(id)

      session && session.handleMessage(msg, rinfo)
    } catch (err) {
      if (err.message === util.INVALID_ENCODING) {
        err.message += ` from: addr=${rinfo.address}, port=${rinfo.port}`
      }

      this.handleError(err)
    }
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
    this.sessions.forEach(session => session.delete())

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
