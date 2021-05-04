const crypto = require('crypto')
const dgram = require('dgram')
const { promisify } = require('util')
const util = require('./util')

const randBytes = promisify(crypto.randomBytes)

class Session {
  constructor (server, sock, rinfo) {
    this.addr = ''
    this.contact = null
    this.ended = false
    this.id = ''
    this.nonce = 0
    this.peer = null
    this.port = 0
    this.proto = ''
    this.server = server
    this.sock = sock

    sock instanceof dgram.Socket
      ? this.fromRemoteInfo(rinfo)
      : this.fromSocket(sock)

    const addr = util.addressToBuffer(this.addr)
    const port = Buffer.alloc(2)

    port.writeUint16BE(this.port)

    this.contact = Buffer.concat([addr, port])
    this.url = this.proto.toLowerCase() + '://' + this.addr + ':' + this.port

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

  handleConnectRequest (msg) {
    if (this.peer) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Already issued connect request')
      return
    }

    const id = msg.body.toString('base64')

    if (id === this.id) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Must specify other session')
      return
    }

    const session = this.server.getSession(id)

    if (!session) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Session not found')
      return
    }

    if (session.proto !== this.proto) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Session must use same protocol')
      return
    }

    if (!session.peer) {
      this.nonce = msg.nonce
      this.peer = session
      this.send(util.MESSAGES.CONNECT_WAIT, msg.nonce)
      return
    }

    if (session.peer.id !== this.id) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Cannot connect to session')
      return
    }

    session.send(util.MESSAGES.CONNECT_RESPONSE, session.nonce, this.contact)
    this.send(util.MESSAGES.CONNECT_RESPONSE, msg.nonce, session.contact)
  }

  async handleIdRequest (msg) {
    const body = await randBytes(util.ID_LENGTH)
    this.id = body.toString('base64')
    this.send(util.MESSAGES.ID_RESPONSE, msg.nonce, body)
    this.set()
  }

  logError (...args) {
    util.log.error(`[${this.proto}-SESSION]`, `\`${this.url}\``, '>', ...args)
  }

  logInfo (...args) {
    util.log.info(`[${this.proto}-SESSION]`, `\`${this.url}\``, '>', ...args)
  }

  send (type, nonce, body) {
    util.send(this.sock, type, nonce, body, this.port, this.addr)
  }
}

module.exports = Session
