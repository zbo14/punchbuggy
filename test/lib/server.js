const assert = require('assert')
const { cert, key } = require('../fixtures')
const Server = require('../../lib/server')
const util = require('../../lib/util')

describe('lib/server', () => {
  beforeEach(() => {
    this.server = new Server({ cert, key })
  })

  describe('#handleDatagram()', () => {
    it('errors if message isn\'t INFO_REQUEST', async () => {
      const msg = util.encode(util.MESSAGES.ID_REQUEST, 0)

      const promise = new Promise((resolve, reject) => {
        this.server.handleError = reject
      })

      this.server.handleDatagram(msg, {
        address: '4.3.2.1',
        port: 54321
      })

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(
          message,
          `Unexpected message: code=${util.MESSAGE_CODES.ID_REQUEST}, type=ID_REQUEST from: addr=4.3.2.1, port=54321`
        )
      }
    })

    it('errors if message is empty', async () => {
      const promise = new Promise((resolve, reject) => {
        this.server.handleError = reject
      })

      this.server.handleDatagram(Buffer.alloc(0), {
        address: '4.3.2.1',
        port: 54321
      })

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Invalid message encoding from: addr=4.3.2.1, port=54321')
      }
    })
  })
})
