const dgram = require('dgram')

const BUFFER_LENGTH = 4096
const DEFAULT_PORT = 12435
const ID_LENGTH = 6
const MAX_UINT32 = 4294967295

const CONNECT_REQUEST = 'CONNECT_REQUEST'
const CONNECT_RESPONSE = 'CONNECT_RESPONSE'
const ID_REQUEST = 'ID_REQUEST'
const ID_RESPONSE = 'ID_RESPONSE'

const MESSAGES = {
  CONNECT_REQUEST,
  CONNECT_RESPONSE,
  ID_REQUEST,
  ID_RESPONSE,
}

const MESSAGE_TYPES = [
  CONNECT_REQUEST,
  CONNECT_RESPONSE,
  ID_REQUEST,
  ID_RESPONSE
]

const MESSAGE_CODES = MESSAGE_TYPES
  .reduce((obj, type, i) => ({ ...obj, [type]: i }), {})

/**
 * @param  {Buffer} buf
 *
 * @return {Object}
 */
const decode = buf => {
  const length = buf.readUint16BE()
  const code = buf[2]
  const type = MESSAGE_TYPES[code]
  const nonce = buf.readUint32BE(3)
  const body = Buffer.from(buf.slice(7, 7 + length - 5))

  return { length, code, type, nonce, body }
}

/**
 * @param  {String} type
 * @param  {Number} nonce
 * @param  {Buffer} [body]
 *
 * @return {Buffer}
 */
const encode = (type, nonce, body = Buffer.alloc(0)) => {
  const len = Buffer.alloc(2)
  len.writeUint16BE(5 + body.byteLength)

  const head = Buffer.alloc(5)
  head[0] = MESSAGE_CODES[type]
  head.writeUint32BE(nonce, 1)

  return Buffer.concat([len, head, body])
}

const getMessageType = msg => MESSAGE_TYPES[msg[0]]

/**
 * @param  {tls.TLSSocket} sock
 * @param  {Function}      handleError
 * @param  {Function}      handleMessage
 */
const receiveMessages = (sock, handleError, handleMessage) => {
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
      const msg = decode(buf)
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

  sock.on('data', handleData)
}

const error = (...msgs) => console.error('\x1b[31m', ...msgs, '\x1b[0m')
const info = (...msgs) => console.log('\x1b[32m', ...msgs, '\x1b[0m')
const warn = (...msgs) => console.warn('\x1b[33m', ...msgs, '\x1b[0m')

const log = {
  error,
  info,
  warn
}

/**
 * @param  {[type]} sock
 * @param  {String} type
 * @param  {Number} nonce
 * @param  {Buffer} body
 * @param  {Number} [port]
 * @param  {String} [addr]
 */
const send = (sock, type, nonce, body, port, addr) => {
  const msg = encode(type, nonce, body)

  sock instanceof dgram.Socket
    ? sock.send(msg, port, addr)
    : sock.write(msg)
}

/**
 * @param  {Number} ms
 *
 * @return {Promise}
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  BUFFER_LENGTH,
  DEFAULT_PORT,
  ID_LENGTH,
  MAX_UINT32,
  MESSAGE_CODES,
  MESSAGE_TYPES,
  MESSAGES,
  decode,
  encode,
  getMessageType,
  log,
  receiveMessages,
  send,
  sleep
}
