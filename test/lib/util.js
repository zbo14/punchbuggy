const assert = require('assert')
const EventEmitter = require('events')
const util = require('../../lib/util')

describe('lib/util', () => {
  describe('#encode()', () => {
    it('encodes a message', () => {
      const nonce = 0
      const body = Buffer.from('foobar')
      const buf = util.encode(util.MESSAGES.ID_REQUEST, nonce, body)

      assert(Buffer.isBuffer(buf))
      assert.strictEqual(buf.byteLength, body.byteLength + 7)
    })
  })

  describe('#decode()', () => {
    it('decodes a message', () => {
      const nonce = 0
      const body = Buffer.from('foobar')
      const buf = util.encode(util.MESSAGES.ID_REQUEST, nonce, body)
      const msg = util.decode(buf)

      assert.deepStrictEqual(msg, {
        length: body.byteLength + 5,
        code: util.MESSAGE_CODES[util.MESSAGES.ID_REQUEST],
        type: util.MESSAGES.ID_REQUEST,
        nonce,
        body
      })
    })
  })

  describe('#receiveMessages()', () => {
    beforeEach(() => {
      this.sock = new EventEmitter()
    })

    it('receives message', async () => {
      const promise = new Promise((resolve, reject) => {
        util.receiveMessages(this.sock, (err, msg) => {
          err ? reject(err) : resolve(msg)
        })
      })

      const nonce = 0
      const body = Buffer.from('foobar')
      const buf = util.encode(util.MESSAGES.ID_REQUEST, nonce, body)

      this.sock.emit('data', buf)

      const msg = await promise

      assert.deepStrictEqual(msg, {
        length: body.byteLength + 5,
        code: util.MESSAGE_CODES[util.MESSAGES.ID_REQUEST],
        type: util.MESSAGES.ID_REQUEST,
        nonce,
        body
      })
    })

    it('receives message with fragmented length prefix', async () => {
      const promise = new Promise((resolve, reject) => {
        util.receiveMessages(this.sock, (err, msg) => {
          err ? reject(err) : resolve(msg)
        })
      })

      const nonce = 0
      const body = Buffer.from('foobar')
      const buf = util.encode(util.MESSAGES.ID_REQUEST, nonce, body)

      this.sock.emit('data', buf.slice(0, 1))
      this.sock.emit('data', buf.slice(1))

      const msg = await promise

      assert.deepStrictEqual(msg, {
        length: body.byteLength + 5,
        code: util.MESSAGE_CODES[util.MESSAGES.ID_REQUEST],
        type: util.MESSAGES.ID_REQUEST,
        nonce,
        body
      })
    })

    it('receives message and then fragmented message', async () => {
      const msgs = []

      const promise = new Promise((resolve, reject) => {
        util.receiveMessages(this.sock, (err, msg) => {
          if (err) return reject(err)

          msgs.push(msg)
          msgs.length === 2 && resolve()
        })
      })

      const nonce1 = 0
      const body1 = Buffer.from('foo')
      const buf1 = util.encode(util.MESSAGES.ID_REQUEST, nonce1, body1)

      const nonce2 = 1
      const body2 = Buffer.from('baz')
      const buf2 = util.encode(util.MESSAGES.CONNECT_REQUEST, nonce2, body2)

      this.sock.emit('data', buf1)
      this.sock.emit('data', buf2)

      await promise

      assert.deepStrictEqual(msgs, [
        {
          length: body1.byteLength + 5,
          code: util.MESSAGE_CODES[util.MESSAGES.ID_REQUEST],
          type: util.MESSAGES.ID_REQUEST,
          nonce: nonce1,
          body: body1
        },
        {
          length: body2.byteLength + 5,
          code: util.MESSAGE_CODES[util.MESSAGES.CONNECT_REQUEST],
          type: util.MESSAGES.CONNECT_REQUEST,
          nonce: nonce2,
          body: body2
        }
      ])
    })

    it('receives 2 messages from a 1 buffer', async () => {
      const msgs = []

      const promise = new Promise((resolve, reject) => {
        util.receiveMessages(this.sock, (err, msg) => {
          if (err) return reject(err)

          msgs.push(msg)
          msgs.length === 2 && resolve()
        })
      })

      const nonce1 = 0
      const body1 = Buffer.from('foo')
      const buf1 = util.encode(util.MESSAGES.ID_REQUEST, nonce1, body1)

      const nonce2 = 1
      const body2 = Buffer.from('baz')
      const buf2 = util.encode(util.MESSAGES.CONNECT_REQUEST, nonce2, body2)

      const buf = Buffer.concat([buf1, buf2])

      this.sock.emit('data', buf)

      await promise

      assert.deepStrictEqual(msgs, [
        {
          length: body1.byteLength + 5,
          code: util.MESSAGE_CODES[util.MESSAGES.ID_REQUEST],
          type: util.MESSAGES.ID_REQUEST,
          nonce: nonce1,
          body: body1
        },
        {
          length: body2.byteLength + 5,
          code: util.MESSAGE_CODES[util.MESSAGES.CONNECT_REQUEST],
          type: util.MESSAGES.CONNECT_REQUEST,
          nonce: nonce2,
          body: body2
        }
      ])
    })

    it('errors when message too long', async () => {
      const promise = new Promise((resolve, reject) => {
        util.receiveMessages(this.sock, (err, msg) => {
          err ? reject(err) : resolve(msg)
        })
      })

      this.sock.emit('data', Buffer.alloc(util.BUFFER_LENGTH + 1))

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Buffer overflow: message from sender is too long')
      }
    })
  })
})
