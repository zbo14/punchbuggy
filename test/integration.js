const assert = require('assert')
const dgram = require('dgram')
const { getEventListeners } = require('events')
const net = require('net')
const fakeTimers = require('@sinonjs/fake-timers')
const { cert, key } = require('./fixtures')
const Client = require('../lib/client')
const Server = require('../lib/server')
const util = require('../lib/util')

describe('integration', () => {
  beforeEach(async () => {
    this.clock = fakeTimers.install()

    this.client1 = new Client()
    this.client2 = new Client()
    this.client3 = new Client()
    this.server = new Server({ cert, key })

    await this.server.listen()
  })

  afterEach(() => {
    this.server.close()
    this.clock.uninstall()
  })

  describe('client', () => {
    describe('#connectToServer()', () => {
      it('connects to server', async () => {
        await this.client1.connectToServer('127.0.0.1')

        assert(this.client1.serverSock instanceof net.Socket)
        assert(this.client1.udpSock instanceof dgram.Socket)
      })

      it('errors if addr isn\'t an ipv4 address', async () => {
        try {
          await this.client1.connectToServer('127.0.-0.1')
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'First argument must be an IPv4 address')
        }
      })

      it('errors again if addr isn\'t an ipv4 address', async () => {
        try {
          await this.client1.connectToServer('127.0.256.1')
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'First argument must be an IPv4 address')
        }
      })
    })

    describe('#handleServerMessage()', () => {
      it('errors if unexpected message from server', async () => {
        await this.client1.connectToServer('127.0.0.1')

        const msg = util.encode(util.MESSAGES.INFO_REQUEST, 0)

        const promise = new Promise((resolve, reject) => {
          this.client1.handleError = reject
        })

        this.client1.serverSock.emit('data', msg)

        try {
          await promise
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(
            message,
            `Unexpected message from server: code=${util.MESSAGE_CODES.INFO_REQUEST}, type=INFO_REQUEST`
          )
        }
      })
    })

    describe('#sendToServer()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('127.0.0.1')
      })

      it('sets nonce to 0 once it reaches max uint32', () => {
        this.client1.nonce = util.MAX_UINT32
        this.client1.sendToServer(util.MESSAGES.ID_REQUEST)
        assert.strictEqual(this.client1.nonce, 0)
      })
    })

    describe('#requestId()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('127.0.0.1')
      })

      it('requests session ID', async () => {
        await this.client1.requestId()
        const { sid } = this.client1

        assert.strictEqual(typeof sid, 'string')
        assert.strictEqual(Buffer.from(sid, 'base64').byteLength, util.ID_LENGTH)
      })

      it('issues multiple ID requests', async () => {
        await this.client1.requestId()

        try {
          await this.client1.requestId()
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected id request')
        }
      })
    })

    describe('#requestInfo()', () => {
      beforeEach(async () => {
        await Promise.all([
          this.client1.connectToServer('127.0.0.1'),
          this.client2.connectToServer('127.0.0.1'),
          this.client3.connectToServer('127.0.0.1')
        ])

        await Promise.all([
          this.client1.requestId(),
          this.client2.requestId(),
          this.client3.requestId()
        ])
      })

      it('shares session info', async () => {
        await Promise.all([
          this.client1.requestInfo(this.client2.sid),
          this.client2.requestInfo(this.client1.sid)
        ])

        assert.strictEqual(this.client1.peerAddr, this.server.getSession(this.client2.sid).addr)
        assert.strictEqual(this.client1.peerPort, this.server.getSession(this.client2.sid).port)
        assert.strictEqual(this.client1.peerSid, this.client2.sid)

        assert.strictEqual(this.client2.peerAddr, this.server.getSession(this.client1.sid).addr)
        assert.strictEqual(this.client2.peerPort, this.server.getSession(this.client1.sid).port)
        assert.strictEqual(this.client2.peerSid, this.client1.sid)
      })

      it('shares session info after packets dropped', async () => {
        const handleDatagram = this.server.handleDatagram.bind(this.server)
        this.server.handleDatagram = () => {}

        const promise1 = this.client1.requestInfo(this.client2.sid)
        const promise2 = this.client2.requestInfo(this.client1.sid)

        this.server.handleDatagram = handleDatagram
        this.clock.tick(util.RECEIVE_TIMEOUT)

        await Promise.all([promise1, promise2])

        assert.strictEqual(this.client1.peerAddr, this.server.getSession(this.client2.sid).addr)
        assert.strictEqual(this.client1.peerPort, this.server.getSession(this.client2.sid).port)
        assert.strictEqual(this.client1.peerSid, this.client2.sid)

        assert.strictEqual(this.client2.peerAddr, this.server.getSession(this.client1.sid).addr)
        assert.strictEqual(this.client2.peerPort, this.server.getSession(this.client1.sid).port)
        assert.strictEqual(this.client2.peerSid, this.client1.sid)
      })

      it('issues multiple INFO_REQUESTs', async () => {
        await Promise.all([
          this.client1.requestInfo(this.client2.sid),
          this.client2.requestInfo(this.client1.sid)
        ])

        try {
          await this.client1.requestInfo(this.client2.sid)
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected info request')
        }
      })

       it('can\'t request own info', async () => {
        try {
          await this.client1.requestInfo(this.client1.sid)
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Must specify other session')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
      })

      it('can\'t find session', async () => {
        try {
          await this.client1.requestInfo('foobar')
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Session not found')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
      })

      it('can\'t request info for paired session', async () => {
        await Promise.all([
          this.client2.requestInfo(this.client3.sid),
          this.client3.requestInfo(this.client2.sid)
        ])

        try {
          await this.client1.requestInfo(this.client2.sid)
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Cannot return session info')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
      })
    })

    describe('#dialPeer()', () => {
      beforeEach(async () => {
        await Promise.all([
          this.client1.connectToServer('127.0.0.1'),
          this.client2.connectToServer('127.0.0.1')
        ])

        await Promise.all([
          this.client1.requestId(),
          this.client2.requestId()
        ])

        await Promise.all([
          this.client1.requestInfo(this.client2.sid),
          this.client2.requestInfo(this.client1.sid)
        ])
      })

      it('successfully dials between peers', async () => {
        const [sock1, sock2] = await Promise.all([
          this.client1.dialPeer(),
          this.client2.dialPeer()
        ])

        assert.strictEqual(this.client1.dialInterval, null)
        assert.strictEqual(this.client2.dialInterval, null)

        assert(sock1 instanceof dgram.Socket)
        assert.deepStrictEqual(getEventListeners(sock1, 'message'), [])

        assert(sock2 instanceof dgram.Socket)
        assert.deepStrictEqual(getEventListeners(sock2, 'message'), [])
      })

      it('times out on dial', async () => {
        const promise = this.client1.dialPeer()
        this.clock.tick(util.DIAL_TIMEOUT)

        try {
          await promise
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Dial timeout')
        }
      })
    })
  })

  describe('session', () => {
    describe('#handleDialedRequest()', () => {
      beforeEach(async () => {
        await Promise.all([
          this.client1.connectToServer('127.0.0.1'),
          this.client2.connectToServer('127.0.0.1')
        ])

        await Promise.all([
          this.client1.requestId(),
          this.client2.requestId()
        ])

        await Promise.all([
          this.client1.requestInfo(this.client2.sid),
          this.client2.requestInfo(this.client1.sid)
        ])
      })

      it('handles multiple DIALED_REQUESTs', async () => {
        try {
          await Promise.all([
            this.client1.request(util.MESSAGES.DIALED_REQUEST),
            this.client1.request(util.MESSAGES.DIALED_REQUEST)
          ])

          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected dialed request')
        }
      })
    })

    describe('#handleError()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('127.0.0.1')
        await this.client1.requestId()
      })

      it('handles unexpected message code', async () => {
        const msg = util.encode(util.MESSAGES.DIALED_RESPONSE, 0)
        const session = this.server.getSession(this.client1.sid)

        const promise = new Promise((resolve, reject) => {
          session.handleError = reject
        })

        session.sock.emit('data', msg)

        try {
          await promise
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(
            message,
            `Unexpected message from client: code=${util.MESSAGE_CODES.DIALED_RESPONSE}, type=DIALED_RESPONSE`
          )
        }
      })
    })
  })
})
