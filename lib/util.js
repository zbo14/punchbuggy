const BUF_LEN = 4096
const MSG_TYPES = []

/**
 * @param  {Buffer} buf
 *
 * @return {Object}
 */
const decode = buf => {
  const len = buf.slice(0, 2).readUint16BE()
  const idx = 2 + len
  const body = buf.slice(2, idx)

  return { body, idx }
}

/**
 * @param  {Buffer} body
 *
 * @return {Buffer}
 */
const encode = body => {
  const head = Buffer.alloc(2)
  head.writeUint16BE(body.byteLength)

  return Buffer.concat([head, body])
}

/**
 * @param  {tls.TLSSocket} conn
 * @param  {Function}      onErr
 * @param  {Function}      onMsg
 */
const recvMsgs = (conn, handleErr, handleMsg) => {
  const buf = Buffer.alloc(BUF_LEN)

  let idx = 0
  let len = 0

  const handleData = chunk => {
    if (chunk) {
      if (idx + chunk.byteLength > BUF_LEN) {
        handleErr(new Error('Buffer overflow: message too long'))
        return
      }

      chunk.copy(buf, idx)
      idx += chunk.byteLength
    }

    if (!len && idx >= 2) {
      len = buf.readUint16BE()
    }

    if (len && idx >= 2 + len) {
      const msg = Buffer.from(buf.slice(2, 2 + len))
      handleMsg(msg)

      if (idx === 2 + len) {
        idx = 0
        len = 0
        return
      }

      buf.copy(buf, 0, 2 + len, idx)
      idx -= 2 + len
      len = 0

      handleData()
    }
  }

  conn.on('data', handleData)
}

module.exports = {
  BUF_LEN,
  MSG_TYPES,
  decode,
  encode,
  recvMsgs
}
