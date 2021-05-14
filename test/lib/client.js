const assert = require('assert')
const Client = require('../../lib/client')
const util = require('../../lib/util')

describe('lib/client', () => {
  beforeEach(() => {
    this.client = new Client()
  })

  describe('#on(\'message\')', () => {
    it('errors if message has unexpected type', async () => {
      const msg = util.encode(util.MESSAGES.CONNECT_REQUEST, 0)

      this.client.peerAddr = '1.2.3.4'
      this.client.peerPort = 1234

      await this.client.createUDPSocket()

      const promise = new Promise((resolve, reject) => {
        this.client.handleError = reject
      })

      this.client.udpSock.emit('message', msg, {
        address: this.client.peerAddr,
        port: this.client.peerPort
      })

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Unexpected message from peer: code=0, type=CONNECT_REQUEST')
      }
    })

    it('errors if message is empty', async () => {
      this.client.peerAddr = '1.2.3.4'
      this.client.peerPort = 1234

      this.client.handleDial = () => {
        assert.fail('Shouldn\'t get here')
      }

      await this.client.createUDPSocket()

      const promise = new Promise((resolve, reject) => {
        this.client.handleError = reject
      })

      this.client.udpSock.emit('message', Buffer.alloc(0), {
        address: this.client.peerAddr,
        port: this.client.peerPort
      })

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Invalid message encoding from peer')
      }
    })

    it('errors if message isn\'t from peer', async () => {
      const msg = util.encode(util.MESSAGES.DIAL, 0)

      this.client.peerAddr = '1.2.3.4'
      this.client.peerPort = 1234

      this.client.handleDial = () => {
        assert.fail('Shouldn\'t get here')
      }

      await this.client.createUDPSocket()

      const promise = new Promise((resolve, reject) => {
        this.client.handleError = reject
      })

      this.client.udpSock.emit('message', msg, {
        address: this.client.peerAddr,
        port: this.client.peerPort + 1
      })

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Unsolicited message from: addr=1.2.3.4, port=1235')
      }
    })
  })
})
