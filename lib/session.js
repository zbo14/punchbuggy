const util = require('./util')

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
    this.state = SESSION_STATES.INITIAL

    this.sock = sock
      .once('close', this.end.bind(this))
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

    setTimeout(this.end.bind(this), util.SESSION_LIFETIME)
  }

  get isDialed () {
    return this.state === SESSION_STATES.DIALED
  }

  end () {
    this.server.deleteSession(this)
    this.sock.end()
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
  handleError (args) {
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

    if (msg.body.byteLength === util.ID_LENGTH) {
      this.setRemoteInfo(rinfo)
      this.sendInfoResponse(null, msg)
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

    session.sendInfoResponse(this)
    this.sendInfoResponse(session, msg)
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

    try {
      const { buf, id } = await this.server.identifySession(this)
      this.id = id
      this.state = SESSION_STATES.IDENTIFIED
      this.send(util.MESSAGES.ID_RESPONSE, msg.nonce, buf)
    } catch ({ message }) {
      this.send(util.MESSAGES.ERROR, msg.nonce, message)
    }
  }

  /* istanbul ignore next */
  logInfo (...args) {
    this.id && util.log.info('[SESSION]', `\`${this.id}\``, '>', ...args)
  }

  send (type, nonce, body) {
    util.send(this.sock, type, nonce, body, this.port, this.addr)
  }

  sendInfoResponse (session, msg = {}) {
    const body = session
      ? Buffer.concat([this.contact, session.contact])
      : this.contact

    this.send(util.MESSAGES.INFO_RESPONSE, msg.nonce || this.nonce, body)
    this.state = SESSION_STATES.INFORMED
  }

  sendDialedResponse (msg = {}) {
    this.send(util.MESSAGES.DIALED_RESPONSE, msg.nonce || this.nonce)
    this.state = SESSION_STATES.ESTABLISHED
  }
}

module.exports = Session
