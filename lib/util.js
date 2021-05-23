const dgram = require('dgram')

const BUFFER_LENGTH = 4096
const CONTACT_LENGTH = 6
const DEFAULT_PORT = 12435
const ID_LENGTH = 6
const INVALID_ENCODING = 'Invalid message encoding'
const MAX_UINT32 = 4294967295

const CONNECT_TIMEOUT = 5e3
const DIAL_TIMEOUT = 30e3
const RECEIVE_TIMEOUT = 10e3
const RETRY_DELAY = 1e3
const SESSION_LIFETIME = 5 * 60e3

const DIAL = 'DIAL'
const DIALED_REQUEST = 'DIALED_REQUEST'
const DIALED_RESPONSE = 'DIALED_RESPONSE'
const ERROR = 'ERROR'
const ID_REQUEST = 'ID_REQUEST'
const ID_RESPONSE = 'ID_RESPONSE'
const INFO_REQUEST = 'INFO_REQUEST'
const INFO_RESPONSE = 'INFO_RESPONSE'

const MESSAGES = {
  DIAL,
  ERROR,
  DIALED_REQUEST,
  DIALED_RESPONSE,
  ID_REQUEST,
  ID_RESPONSE,
  INFO_REQUEST,
  INFO_RESPONSE
}

const MESSAGE_TYPES = [
  DIAL,
  DIALED_REQUEST,
  DIALED_RESPONSE,
  ERROR,
  ID_REQUEST,
  ID_RESPONSE,
  INFO_REQUEST,
  INFO_RESPONSE
]

const MESSAGE_CODES = MESSAGE_TYPES
  .reduce((obj, type, i) => ({ ...obj, [type]: i }), {})

const addressToBuffer = addr => Buffer.from(addr.split('.'))
const bufferToAddress = buf => [...buf.slice(0, 4)].join('.')

const isIPv4Address = addr => {
  if (!/(\d+\.){3}\d+/.test(addr)) return false

  const octets = addr
    .split('.')
    .filter(oct => +oct >= 0 && +oct < 256)

  return octets.length === 4
}

/**
 * @param  {Buffer} buf
 *
 * @return {Object}
 */
const decode = buf => {
  try {
    const length = buf.readUint16BE()
    const code = buf[2]
    const type = MESSAGE_TYPES[code]
    const nonce = buf.readUint32BE(3)
    const body = Buffer.from(buf.slice(7, 7 + length - 5))

    return { length, code, type, nonce, body }
  } catch {
    throw new Error(INVALID_ENCODING)
  }
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

/**
 * @param  {tls.Socket} sock
 * @param  {Function}   cb
 */
const receiveMessages = (sock, cb) => {
  const buf = Buffer.alloc(BUFFER_LENGTH)

  let idx = 0
  let len = 0

  const handleData = chunk => {
    if (chunk) {
      if (idx + chunk.byteLength > BUFFER_LENGTH) {
        cb(new Error('Buffer overflow: message from sender is too long'))
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
      cb(null, msg)

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

/* istanbul ignore next */
const env = (process.env.NODE_ENV || '').trim().toLowerCase()
const isTest = env === 'test'

/* istanbul ignore next */
const error = (...msgs) => isTest || console.error('\x1b[31m', ...msgs, '\x1b[0m')

/* istanbul ignore next */
const info = (...msgs) => isTest || console.log('\x1b[32m', ...msgs, '\x1b[0m')

/* istanbul ignore next */
const warning = (...msgs) => isTest || console.warn('\x1b[33m', ...msgs, '\x1b[0m')

const log = {
  error,
  info,
  warning
}

/**
 * @param  {[type]}          sock
 * @param  {String}          type
 * @param  {Number}          nonce
 * @param  {(Buffer|String)} body
 * @param  {Number}          [port]
 * @param  {String}          [addr]
 */
const send = (sock, type, nonce, body, port, addr) => {
  if (body && !Buffer.isBuffer(body)) {
    body = Buffer.from(body)
  }

  const msg = encode(type, nonce, body)

  sock instanceof dgram.Socket
    ? sock.send(msg, port, addr)
    : sock.write(msg)
}

module.exports = {
  BUFFER_LENGTH,
  CONTACT_LENGTH,
  CONNECT_TIMEOUT,
  DEFAULT_PORT,
  DIAL_TIMEOUT,
  ID_LENGTH,
  INVALID_ENCODING,
  MAX_UINT32,
  MESSAGE_CODES,
  MESSAGE_TYPES,
  MESSAGES,
  RECEIVE_TIMEOUT,
  RETRY_DELAY,
  SESSION_LIFETIME,
  addressToBuffer,
  bufferToAddress,
  decode,
  encode,
  isIPv4Address,
  log,
  receiveMessages,
  send
}
