const assert = require('assert')
const dgram = require('dgram')
const net = require('net')
const fakeTimers = require('@sinonjs/fake-timers')
const Client = require('../lib/client')
const Server = require('../lib/server')
const util = require('../lib/util')

describe('integration', () => {
  describe('UDP', () => {
    beforeEach(async () => {
      this.clock = fakeTimers.install()

      this.client1 = new Client('udp')
      this.client2 = new Client('udp')
      this.client3 = new Client('udp')
      this.server = new Server()

      await this.server.start()
    })

    afterEach(async () => {
      await this.server.stop()
      this.clock.uninstall()
    })

    describe('#connectToServer()', () => {
      it('connects to server', async () => {
        await this.client1.connectToServer('localhost')

        assert(this.client1.serverSock instanceof net.Socket)
        assert.strictEqual(this.client1.tcpSock, null)
        assert(this.client1.udpSock instanceof dgram.Socket)
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

      it('issues multiple connect requests', async () => {
        try {
          await Promise.race([
            this.client1.requestConnect(this.client2.sid),
            this.client1.requestConnect(this.client2.sid)
          ])

          assert.fail('Should reject')
        } catch ({ message }) {
          assert.strictEqual(message, 'Unexpected connect request')
        }

        assert.strictEqual(this.client1.peerAddr, '')
        assert.strictEqual(this.client1.peerPort, 0)
        assert.strictEqual(this.client1.peerSid, '')
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

    describe('#dial()', () => {
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
         await Promise.all([
          this.client1.dial(),
          this.client2.dial()
        ])
      })

      it('times out on dial', async () => {
        const promise = this.client1.dial()
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
})
