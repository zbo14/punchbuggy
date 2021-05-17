const crypto = require('crypto')
const dgram = require('dgram')
const { promisify } = require('util')
const util = require('./util')

const randBytes = promisify(crypto.randomBytes)

const SESSION_STATES = {
  INITIAL: 0,
  IDENTIFIED: 1,
  INFORMING: 2,
  INFORMED: 3,
  DIALED: 4,
  ESTABLISHED: 5
}

class Session {
  constructor (server, sock) {
    this.addr = ''
    this.contact = null
    this.id = ''
    this.nonce = 0
    this.peer = null
    this.port = 0
    this.server = server
    this.sock = sock
    this.state = SESSION_STATES.INITIAL

    this.sock = sock
      .once('close', this.delete.bind(this))
      .on('error', this.handleError.bind(this))

    util.receiveMessages(sock, async (err, msg) => {
      /* istanbul ignore next */
      if (err) {
        this.handleError(err)
        return
      }

      try {
        await this.handleMessage(msg)
      } catch (err) {
        this.handleError(err)
      }
    })

    setTimeout(this.delete.bind(this), util.SESSION_LIFETIME)
  }

  get isDialed () {
    return this.state === SESSION_STATES.DIALED
  }

  delete () {
    this.server.deleteSession(this)
  }

  setRemoteInfo (rinfo) {
    this.addr = rinfo.address
    this.port = rinfo.port

    const addr = util.addressToBuffer(this.addr)
    const port = Buffer.alloc(2)

    port.writeUint16BE(this.port)

    this.contact = Buffer.concat([addr, port])
  }

  /* istanbul ignore next */
  handleError (err) {
    util.log.error('[SESSION]', `\`${this.id || '?'}\``, '>', ...args)
  }

  async handleMessage (msg, rinfo) {
    switch (msg.type) {
      case util.MESSAGES.DIALED_REQUEST: {
        this.handleDialedRequest(msg)
        return
      }

      case util.MESSAGES.ID_REQUEST: {
        await this.handleIdRequest(msg)
        return
      }

      case util.MESSAGES.INFO_REQUEST: {
        this.handleInfoRequest(msg, rinfo)
        return
      }

      default: {
         throw new Error(`Unexpected message from client: code=${msg.code}, type=${msg.type}`)
      }
    }
  }

  handleInfoRequest (msg, rinfo) {
    const unexpected = ![
      SESSION_STATES.IDENTIFIED,
      SESSION_STATES.INFORMING
    ].includes(this.state)

    if (unexpected) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Unexpected info request')
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

    if (!session.peer) {
      this.nonce = msg.nonce
      this.peer = session
      this.state = SESSION_STATES.INFORMING
      this.setRemoteInfo(rinfo)
      return
    }

    if (session.peer.id !== this.id) {
      this.send(util.MESSAGES.ERROR, msg.nonce, 'Cannot return session info')
      return
    }

    this.peer = session
    this.setRemoteInfo(rinfo)

    session.sendConnectResponse(this)
    this.sendConnectResponse(session, msg)
  }

  handleDialedRequest (msg) {
    if (this.state !== SESSION_STATES.INFORMED) {
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

    const body = await randBytes(util.ID_LENGTH)
    this.id = body.toString('base64')
    this.state = SESSION_STATES.IDENTIFIED

    this.send(util.MESSAGES.ID_RESPONSE, msg.nonce, body)
    this.server.setSession(this)
  }

  /* istanbul ignore next */
  logInfo (...args) {
    this.id && util.log.info('[SESSION]', `\`${this.id}\``, '>', ...args)
  }

  send (type, nonce, body) {
    util.send(this.sock, type, nonce, body, this.port, this.addr)
  }

  sendConnectResponse (session, msg = {}) {
    this.send(util.MESSAGES.INFO_RESPONSE, msg.nonce || this.nonce, session.contact)
    this.state = SESSION_STATES.INFORMED
  }

  sendDialedResponse (msg = {}) {
    this.send(util.MESSAGES.DIALED_RESPONSE, msg.nonce || this.nonce)
    this.state = SESSION_STATES.ESTABLISHED
  }
}

module.exports = Session
