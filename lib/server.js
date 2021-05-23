const crypto = require('crypto')
const dgram = require('dgram')
const EventEmitter = require('events')
const tls = require('tls')
const { promisify } = require('util')
const Session = require('./session')
const util = require('./util')

const randBytes = promisify(crypto.randomBytes)

/**
 * Rendezvous server that facilitates UDP hole punching sessions
 * between clients.
 */
class Server {
  constructor (opts) {
    this.addr = ''
    this.port = 0
    this.sessions = new Map()

    this.tlsServer = tls.createServer(opts)
      .on('secureConnection', this.handleSecureConnection.bind(this))
      .on('error', this.handleTLSServerError.bind(this))

    this.udpServer = dgram.createSocket('udp4')
      .on('message', this.handleDatagram.bind(this))
      .on('error', this.handleUDPServerError.bind(this))
  }

  /**
   * Start the TLS and UDP listeners.
   *
   * @param  {Number} [port = 12435]
   * @param  {String} [addr = '0.0.0.0']
   *
   * @return {Promise}
   */
  async listen (port = util.DEFAULT_PORT, addr = '0.0.0.0') {
    const promise = Promise.all([
      EventEmitter.once(this.tlsServer, 'listening'),
      EventEmitter.once(this.udpServer, 'listening')
    ])

    this.tlsServer.listen(port, addr)
    this.udpServer.bind(port, addr)

    await promise

    this.addr = addr
    this.port = port

    this.logInfo(`Listening on \`${this.addr}:${this.port}\``)
  }

  /**
   * Delete existing client sessions and close the listeners.
   *
   * @return {Promise}
   */
  async close () {
    this.tlsServer.close()
    this.udpServer.close()

    this.logInfo('Closed')
  }

  deleteSession (session) {
    this.sessions.delete(session.id)
  }

  generateId () {
    return randBytes(util.ID_LENGTH)
  }

  getSession (id) {
    return this.sessions.get(id)
  }

  async identifySession (session) {
    for (let i = 0; i < 5; i++) {
      const buf = await this.generateId().catch(() => Buffer.alloc(0))
      const id = buf.toString('base64')

      if (!id || this.getSession(id)) continue

      this.sessions.set(id, session)

      return { buf, id }
    }

    throw new Error('Service unavailable')
  }

  /* istanbul ignore next */
  handleError (...msgs) {
    util.log.error('[SERVER]', ...msgs)
  }

  /* istanbul ignore next */
  handleTLSServerError (err) {
    this.handleError('TLS Server', '>', err)
  }

  /* istanbul ignore next */
  handleUDPServerError (err) {
    this.handleError('UDP Server', '>', err)
  }

  /* istanbul ignore next */
  logInfo (...msgs) {
    util.log.info('[SERVER]', ...msgs)
  }

  handleSecureConnection (sock) {
    new Session(this, sock)
  }

  handleDatagram (buf, rinfo) {
    try {
      const msg = util.decode(buf)

      if (msg.type !== util.MESSAGES.INFO_REQUEST) {
        throw new Error(
          `Unexpected message: code=${msg.code}, type=${msg.type} from: addr=${rinfo.address}, port=${rinfo.port}`
        )
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
}

module.exports = Server
