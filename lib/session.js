const crypto = require('crypto')
const tls = require('tls')
const { promisify } = require('util')
const util = require('./util')

const randBytes = promisify(crypto.randomBytes)

class Session {
  constructor (server, sock, rinfo) {
    this.addr = ''
    this.ended = false
    this.id = null
    this.port = 0
    this.proto = ''
    this.server = server
    this.sock = sock

    sock instanceof tls.TLSSocket
      ? this.fromSocket(sock)
      : this.fromRemoteInfo(rinfo)

    this.url = this.proto + '://' + this.addr + ':' + this.port
    this.set()
  }

  delete () {
    this.server.deleteSession(this)
  }

  end () {
    if (this.ended) return

    this.ended = true

    this.proto === util.PROTOCOLS.TLS
      ? this.sock.end()
      : this.delete()
  }

  set () {
    this.server.setSession(this)
  }

  fromRemoteInfo (rinfo) {
    this.addr = rinfo.address
    this.port = rinfo.port
    this.proto = util.PROTOCOLS.UDP
    this.sock = this.server.udpServer
  }

  fromSocket (sock) {
    const handleError = this.handleError.bind(this)
    const handleMessage = this.handleMessage.bind(this)

    this.addr = sock.remoteAddress
    this.port = sock.remotePort
    this.proto = util.PROTOCOLS.TLS

    this.sock = sock
      .once('close', this.delete.bind(this))
      .on('error', handleError)

    util.receiveMessages(sock, handleError, handleMessage)
  }

  handleError (err) {
    this.logError(err)
    this.end()
  }

  async handleMessage (msg) {
    switch (msg.type) {
       case util.MESSAGES.CONNECT_REQUEST: {
        this.handleConnectRequest(msg)
        return
      }

      case util.MESSAGES.ID_REQUEST: {
        await this.handleIdRequest(msg)
        return
      }

      default: {
        const err = new Error('Unrecognized message code:', msg.code)
        this.handleError(err)
      }
    }
  }

  handleConnectRequest (msg) {}

  async handleIdRequest (msg) {
    this.id = await randBytes(util.ID_LENGTH)
    this.send(util.MESSAGES.ID_RESPONSE, msg.nonce, this.id)
    this.set()
  }

  logError (...args) {
    util.log.error('[SESSION]', `\`${this.url}\``, '>', ...args)
  }

  logInfo (...args) {
    util.log.info('[SESSION]', `\`${this.url}\``, '>', ...args)
  }

  send (type, nonce, body) {
    util.send(this.sock, type, nonce, body, this.port, this.addr)
  }
}

module.exports = Session
