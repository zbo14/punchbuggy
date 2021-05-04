const dgram = require('dgram')
const { once } = require('events')
const util = require('./util')

class Server {
  constructor (proto, opts) {
    this.addr = ''
    this.port = 0
    this.proto = proto
    this.sessionById = new Map()
    this.sessionByURL = new Map()

    this.listener = this.createListener(opts)
      .on('error', this.handleError.bind(this))
  }

  createListener () {
    throw new Error('Not implemented')
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

  logError (...msgs) {
    util.log.error(`[${this.proto}-SERVER]`, ...msgs)
  }

  logInfo (...msgs) {
    util.log.info(`[${this.proto}-SERVER]`, ...msgs)
  }

  handleError (err) {
    this.logError(err)
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
   this.listener instanceof dgram.Socket
     ? this.listener.bind(port, addr)
     : this.listener.listen(port, addr)

    await once(this.listener, 'listening')

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
    this.sessionByURL.forEach(session => session.end())
    this.listener.close()

    await once(this.listener, 'close')

    this.logInfo('Stopped')
  }
}

module.exports = Server
