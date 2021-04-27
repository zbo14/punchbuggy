const BUFFER_LENGTH = 4096
const DEFAULT_PORT = 12435

const INQUIRE_ABOUT = 'INQUIRE_ABOUT'
const THEIR_INFO = 'THEIR_INFO'
const YOUR_PORT = 'YOUR_PORT'

const MESSAGES = {
  INQUIRE_ABOUT,
  THEIR_INFO,
  YOUR_PORT
}

const MESSAGE_TYPES = [
  INQUIRE_ABOUT,
  THEIR_INFO,
  YOUR_PORT
]

const MESSAGE_CODES = MESSAGE_TYPES
  .reduce((obj, type, i) => ({ ...obj, [type]: i }), {})

console.log(MESSAGE_CODES)

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

const getMessageType = msg => MESSAGE_TYPES[msg[0]]

/**
 * @param  {tls.TLSSocket} conn
 * @param  {Function}      onErr
 * @param  {Function}      onMsg
 */
const receiveMessages = (conn, handleError, handleMessage) => {
  const buf = Buffer.alloc(BUFFER_LENGTH)

  let idx = 0
  let len = 0

  const handleData = chunk => {
    if (chunk) {
      if (idx + chunk.byteLength > BUFFER_LENGTH) {
        handleError(new Error('Buffer overflow: message too long'))
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
      handleMessage(msg)

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

const error = (...msgs) => console.error('\x1b[31m', ...msgs, '\x1b[0m')
const info = (...msgs) => console.log('\x1b[32m', ...msgs, '\x1b[0m')
const warn = (...msgs) => console.warn('\x1b[33m', ...msgs, '\x1b[0m')

const log = {
  error,
  info,
  warn
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  BUFFER_LENGTH,
  DEFAULT_PORT,
  MESSAGE_CODES,
  MESSAGE_TYPES,
  MESSAGES,
  decode,
  encode,
  getMessageType,
  log,
  receiveMessages,
  sleep
}
