const assert = require('assert')
const dgram = require('dgram')
const fs = require('fs')
const path = require('path')
const Client = require('../lib/client')
const Server = require('../lib/server')
const util = require('../lib/util')

const fixtures = path.join(__dirname, 'fixtures')
const cert = fs.readFileSync(path.join(fixtures, 'cert.pem'))
const key = fs.readFileSync(path.join(fixtures, 'key.pem'))

describe('integration', () => {
  beforeEach(async () => {
    this.client1 = new Client()
    this.client2 = new Client()
    this.server = new Server({ cert, key })

    await this.server.start()
  })

  afterEach(async () => {
    await this.server.stop()
  })

  describe('UDP', () => {
    it('creates socket', async () => {
      assert.strictEqual(this.client1.sock, null)
      await this.client1.start('localhost')
      assert(this.client1.sock instanceof dgram.Socket)
    })

    it('gets session ID', async () => {
      await this.client1.start('localhost')
      const sid = await this.client1.requestId()

      assert(Buffer.isBuffer(sid))
      assert.strictEqual(sid.byteLength, util.ID_LENGTH)
      assert.deepStrictEqual(sid, this.client1.sid)
    })
  })
})
