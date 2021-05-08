const crypto = require('crypto')
const dgram = require('dgram')
const { promisify } = require('util')
const util = require('./util')

const randBytes = promisify(crypto.randomBytes)

const SESSION_STATES = {
  INITIAL: 0,
  IDENTIFIED: 1,
  CONNECTING: 2,
  CONNECTED: 3,
  DIALED: 4,
  DONE: 5
}

class Session {
  constructor (server, sock) {
    this.addr = ''
    this.contact = null
    this.id = ''
    this.nonce = 0
    this.peer = null
    this.port = 0
    this.proto = ''
    this.server = server
    this.sock = sock
    this.state = SESSION_STATES.INITIAL

    const handleError = this.handleError.bind(this)
    const handleMessage = this.handleMessage.bind(this)

    this.sock = sock
      .once('close', this.delete.bind(this))
      .on('error', handleError)

    util.receiveMessages(sock, handleError, handleMessage)
    setTimeout(this.end.bind(this), util.SESSION_LIFETIME)
  }

  get isDialed () {
    return this.state === SESSION_STATES.DIALED
  }

  get isTCP () {
    return this.proto === util.PROTOCOLS.TCP
  }

  delete () {
    this.server.deleteSession(this)
  }

  end () {
    this.isTCP && this.sock.end()
    this.delete()
  }

  setRemoteInfo (rinfo) {
    this.addr = this.isTCP ? this.sock.remoteAddress : rinfo.address
    this.port = this.isTCP ? this.sock.remotePort : rinfo.port

    const addr = util.addressToBuffer(this.addr)
    const port = Buffer.alloc(2)

    port.writeUint16BE(this.port)

    this.contact = Buffer.concat([addr, port])
  }

  handleError (err) {
    this.logError(err)
    this.end()
  }

  async handleMessage (msg, rinfo) {
    switch (msg.type) {
      case util.MESSAGES.CONNECT_REQUEST: {
        this.handleConnectRequest(msg, rinfo)
        return
      }

      case util.MESSAGES.DIALED_REQUEST: {
        this.handleDialedRequest(msg)
        return
      }

      case util.MESSAGES.ID_REQUEST: {
        await this.handleIdRequest(msg)
        return
      }

      default: {
        const err = new Error('Unrecognized message code: ' + msg.code)
        this.handleError(err)
      }
    }
  }

  handleConnectRequest (msg, rinfo) {
    if (this.state !== SESSION_STATES.IDENTIFIED) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Unexpected connect request')
      return
    }

    const id = msg.body
      .slice(util.ID_LENGTH, 2 * util.ID_LENGTH)
      .toString('base64')

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
      this.state = SESSION_STATES.CONNECTING
      this.setRemoteInfo(rinfo)
      return
    }

    if (session.peer.id !== this.id) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Cannot connect to session')
      return
    }

    this.peer = session
    this.setRemoteInfo(rinfo)

    session.sendConnectResponse(this)
    this.sendConnectResponse(session, msg)
  }

  handleDialedRequest (msg) {
    if (this.state !== SESSION_STATES.CONNECTED) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Unexpected dialed request')
      return
    }

    if (!this.peer.isDialed) {
      this.nonce = msg.nonce
      this.state = SESSION_STATES.DIALED
      return
    }

    this.peer.sendDialedResponse()
    this.sendDialedResponse(msg)
  }

  async handleIdRequest (msg) {
    if (this.state !== SESSION_STATES.INITIAL) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Unexpected id request')
      return
    }

    const proto = msg.body.toString().trim().toUpperCase()

    if (!util.PROTOCOLS[proto]) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Invalid protocol: ' + proto)
      return
    }

    const body = await randBytes(util.ID_LENGTH)
    this.id = body.toString('base64')
    this.proto = proto
    this.state = SESSION_STATES.IDENTIFIED

    this.send(util.MESSAGES.ID_RESPONSE, msg.nonce, body)
    this.server.setSession(this)
  }

  logError (...args) {
    this.id && util.log.error('[SESSION]', `\`${this.id}\``, '>', ...args)
  }

  logInfo (...args) {
    this.id && util.log.info('[SESSION]', `\`${this.id}\``, '>', ...args)
  }

  send (type, nonce, body) {
    util.send(this.sock, type, nonce, body, this.port, this.addr)
  }

  sendConnectResponse (session, msg = {}) {
    this.send(util.MESSAGES.CONNECT_RESPONSE, msg.nonce || this.nonce, session.contact)
    this.state = SESSION_STATES.CONNECTED
  }

  sendDialedResponse (msg = {}) {
    this.send(util.MESSAGES.DIALED_RESPONSE, msg.nonce || this.nonce)
    this.state = SESSION_STATES.DONE
  }
}

module.exports = Session
