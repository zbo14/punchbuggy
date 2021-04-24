const assert = require('assert')
const EventEmitter = require('events')
const util = require('../../lib/util')

describe('lib/util', () => {
  describe('#encode()', () => {
    it('encodes a message', () => {
      const body = Buffer.from('foobar')
      const buf = util.encode(body)

      assert(Buffer.isBuffer(buf))
      assert.strictEqual(buf.byteLength, body.byteLength + 2)
    })
  })

  describe('#decode()', () => {
    it('decodes a message', () => {
      const body = Buffer.from('foobar')
      const buf = util.encode(body)
      const result = util.decode(buf)

      assert.deepStrictEqual(result, {
        body,
        idx: buf.byteLength
      })
    })
  })

  describe('#recvMsgs()', () => {
    beforeEach(() => {
      this.conn = new EventEmitter()
    })

    it('receives message', async () => {
      const promise = new Promise((resolve, reject) => {
        util.recvMsgs(this.conn, reject, resolve)
      })

      const head = Buffer.alloc(2)
      const body = Buffer.from('foobar')

      head.writeUint16BE(body.byteLength)

      const buf = Buffer.concat([head, body])

      this.conn.emit('data', buf)

      const result = await promise

      assert.deepStrictEqual(result, body)
    })

    it('receives message and then fragmented message', async () => {
      const msgs = []

      const promise = new Promise((resolve, reject) => {
        util.recvMsgs(this.conn, reject, msg => {
          msgs.push(msg)
          msgs.length === 2 && resolve()
        })
      })

      const head1 = Buffer.alloc(2)
      const body1 = Buffer.from('foo')

      head1.writeUint16BE(body1.byteLength)

      const head2 = Buffer.alloc(2)
      const body2 = Buffer.from('baz')

      head2.writeUint16BE(body2.byteLength)

      const buf1 = Buffer.concat([head1, body1, head2])
      const buf2 = body2

      this.conn.emit('data', buf1)
      this.conn.emit('data', buf2)

      await promise

      assert.deepStrictEqual(msgs, [body1, body2])
    })

    it('receives 2 messages from a 1 buffer', async () => {
      const msgs = []

      const promise = new Promise((resolve, reject) => {
        util.recvMsgs(this.conn, reject, msg => {
          msgs.push(msg)
          msgs.length === 2 && resolve()
        })
      })

      const head1 = Buffer.alloc(2)
      const body1 = Buffer.from('foo')

      head1.writeUint16BE(body1.byteLength)

      const head2 = Buffer.alloc(2)
      const body2 = Buffer.from('baz')

      head2.writeUint16BE(body2.byteLength)

      const buf = Buffer.concat([head1, body1, head2, body2])

      this.conn.emit('data', buf)

      await promise

      assert.deepStrictEqual(msgs, [body1, body2])
    })

    it('errors when message too long', async () => {
      const promise = new Promise((resolve, reject) => {
        util.recvMsgs(this.conn, reject, resolve)
      })

      this.conn.emit('data', Buffer.alloc(util.BUF_LEN + 1))

      try {
        await promise
        assert.fail('Should reject')
      } catch ({ message }) {
        assert.strictEqual(message, 'Buffer overflow: message too long')
      }
    })
  })
})
