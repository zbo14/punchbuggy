const { once } = require('events')
const tls = require('tls')
const util = require('./util')

/**
 * @extends tls.Server
 */
class Server extends tls.Server {
  constructor (opts) {
    super(opts)

    this.clients = new Map()

    this.on('connection', this.handleConn.bind(this))
  }

  handleConn (conn) {
    const { localAddress, localPort, remoteAddress, remotePort } = conn
    const handleErr = this.handleConnErr.bind(this, conn)
    const handleMsg = this.handleConnMsg.bind(this, conn)

    util.recvMsgs(conn, handleErr, handleMsg)

    console.log({ localAddress, localPort, remoteAddress, remotePort })
  }

  handleConnErr (conn, err) {
    console.error(err)
  }

  handleConnMsg (conn, msg) {
    console.log(msg)
  }

  /**
   * Start the TLS server.
   *
   * @param  {Number} port
   * @param  {String} [host = '0.0.0.0']
   *
   * @return {Promise}
   */
  start (port, host = '0.0.0.0') {
    this.listen(port, host)

    return once(this, 'listening')
  }

  /**
   * Stop the TLS server.
   *
   * @return {Promise}
   */
  stop () {
    this.close()

    return once(this, 'close')
  }
}

module.exports = Server
