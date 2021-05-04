const assert = require('assert')
const dgram = require('dgram')
const fs = require('fs')
const path = require('path')
const UDPClient = require('../lib/udp-client')
const UDPServer = require('../lib/udp-server')
const util = require('../lib/util')

const fixtures = path.join(__dirname, 'fixtures')
const cert = fs.readFileSync(path.join(fixtures, 'cert.pem'))
const key = fs.readFileSync(path.join(fixtures, 'key.pem'))

describe('integration', () => {
  describe('UDP', () => {
    beforeEach(async () => {
      this.client1 = new UDPClient()
      this.client2 = new UDPClient()
      this.client3 = new UDPClient()
      this.server = new UDPServer({ cert, key })

      await this.server.start()
    })

    afterEach(async () => {
      await this.server.stop()
    })

    it('creates socket', async () => {
      assert.strictEqual(this.client1.sock, null)
      await this.client1.start('localhost')
      assert(this.client1.sock instanceof dgram.Socket)
    })

    it('gets session ID', async () => {
      assert.strictEqual(this.client1.sid, '')

      await this.client1.start('localhost')
      await this.client1.requestId()
      const { sid } = this.client1

      assert.strictEqual(typeof sid, 'string')
      assert.strictEqual(Buffer.from(sid, 'base64').byteLength, util.ID_LENGTH)
    })

    it('connects sessions', async () => {
      assert.strictEqual(this.client1.peerAddr, '')
      assert.strictEqual(this.client1.peerPort, 0)
      assert.strictEqual(this.client1.peerSid, '')

      assert.strictEqual(this.client2.peerAddr, '')
      assert.strictEqual(this.client2.peerPort, 0)
      assert.strictEqual(this.client2.peerSid, '')

      await Promise.all([
        this.client1.start('localhost'),
        this.client2.start('localhost')
      ])

      await Promise.all([
        this.client1.requestId(),
        this.client2.requestId()
      ])

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
       await Promise.all([
        this.client1.start('localhost'),
        this.client2.start('localhost')
      ])

      await Promise.all([
        this.client1.requestId(),
        this.client2.requestId()
      ])

      try {
        await Promise.race([
          this.client1.requestConnect(this.client2.sid),
          this.client1.requestConnect(this.client2.sid)
        ])

        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Already issued connect request')
      }

      assert.strictEqual(this.client1.peerAddr, '')
      assert.strictEqual(this.client1.peerPort, 0)
      assert.strictEqual(this.client1.peerSid, '')
    })

     it('can\'t connect to self', async () => {
      await this.client1.start('localhost')
      await this.client1.requestId()

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
      await this.client1.start('localhost')
      await this.client1.requestId()

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
        this.client1.start('localhost'),
        this.client2.start('localhost'),
        this.client3.start('localhost')
      ])

      await Promise.all([
        this.client1.requestId(),
        this.client2.requestId(),
        this.client3.requestId()
      ])

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
})
