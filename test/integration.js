const assert = require('assert')
const dgram = require('dgram')
const { getEventListeners } = require('events')
const net = require('net')
const fakeTimers = require('@sinonjs/fake-timers')
const Client = require('../lib/client')
const Server = require('../lib/server')
const util = require('../lib/util')

describe('integration', () => {
  beforeEach(async () => {
    this.clock = fakeTimers.install()

    this.client1 = new Client()
    this.client2 = new Client()
    this.client3 = new Client()
    this.server = new Server()

    await this.server.start()
  })

  afterEach(async () => {
    await this.server.stop()
    this.clock.uninstall()
  })

  describe('client', () => {
    describe('#connectToServer()', () => {
      it('connects to server', async () => {
        await this.client1.connectToServer('localhost')

        assert(this.client1.serverSock instanceof net.Socket)
        assert(this.client1.udpSock instanceof dgram.Socket)
      })
    })

    describe('#handleServerMessage()', () => {
      it('errors if unexpected message from server', async () => {
        await this.client1.connectToServer('localhost')

        const msg = util.encode(util.MESSAGES.CONNECT_REQUEST, 0)

        const promise = new Promise((resolve, reject) => {
          this.client1.handleError = reject
        })

        this.client1.serverSock.emit('data', msg)

        try {
          await promise
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected message from server: code=0, type=CONNECT_REQUEST')
        }
      })
    })

    describe('#sendToServer()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('localhost')
      })

      it('sets nonce to 0 once it reaches max uint32', () => {
        this.client1.nonce = util.MAX_UINT32
        this.client1.sendToServer(util.MESSAGES.ID_REQUEST)
        assert.strictEqual(this.client1.nonce, 0)
      })
    })

    describe('#requestId()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('localhost')
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

    describe('#requestConnect()', () => {
      beforeEach(async () => {
        await Promise.all([
          this.client1.connectToServer('localhost'),
          this.client2.connectToServer('localhost'),
          this.client3.connectToServer('localhost')
        ])

        await Promise.all([
          this.client1.requestId(),
          this.client2.requestId(),
          this.client3.requestId()
        ])
      })

      it('connects sessions', async () => {
        await Promise.all([
          this.client1.requestConnect(this.client2.sid),
          this.client2.requestConnect(this.client1.sid)
        ])

        assert.strictEqual(this.client1.peerAddr, this.server.getSession(this.client2.sid).addr)
        assert.strictEqual(this.client1.peerPort, this.server.getSession(this.client2.sid).port)
        assert.strictEqual(this.client1.peerSid, this.client2.sid)

        assert.strictEqual(this.client2.peerAddr, this.server.getSession(this.client1.sid).addr)
        assert.strictEqual(this.client2.peerPort, this.server.getSession(this.client1.sid).port)
        assert.strictEqual(this.client2.peerSid, this.client1.sid)
      })

      it('connects sessions after packets dropped', async () => {
        const handleDatagram = this.server.handleDatagram.bind(this.server)
        this.server.handleDatagram = () => {}

        const promise1 = this.client1.requestConnect(this.client2.sid)
        const promise2 = this.client2.requestConnect(this.client1.sid)

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

      it('issues multiple connect requests', async () => {
        await Promise.all([
          this.client1.requestConnect(this.client2.sid),
          this.client2.requestConnect(this.client1.sid)
        ])

        try {
          await this.client1.requestConnect(this.client2.sid)
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected connect request')
        }
      })

       it('can\'t connect to self', async () => {
        try {
          await this.client1.requestConnect(this.client1.sid)
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
          await this.client1.requestConnect('foobar')
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Session not found')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
      })

      it('can\'t connect to paired session', async () => {
        await Promise.all([
          this.client2.requestConnect(this.client3.sid),
          this.client3.requestConnect(this.client2.sid)
        ])

        try {
          await this.client1.requestConnect(this.client2.sid)
          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Cannot connect to session')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
      })
    })

    describe('#dialPeer()', () => {
      beforeEach(async () => {
        await Promise.all([
          this.client1.connectToServer('localhost'),
          this.client2.connectToServer('localhost')
        ])

        await Promise.all([
          this.client1.requestId(),
          this.client2.requestId()
        ])

        await Promise.all([
          this.client1.requestConnect(this.client2.sid),
          this.client2.requestConnect(this.client1.sid)
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
    describe('#handleError()', () => {
      beforeEach(async () => {
        await this.client1.connectToServer('localhost')
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
          assert.strictEqual(message, 'Unexpected message from client: code=4, type=DIALED_RESPONSE')
        }
      })
    })
  })
})
