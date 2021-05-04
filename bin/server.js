const fs = require('fs')
const path = require('path')
const Server = require('../lib/udp-server')

// const priv = path.join(__dirname, '..', 'private')
// const cert = fs.readFileSync(path.join(priv, 'cert.pem'))
// const key = fs.readFileSync(path.join(priv, 'key.pem'))

module.exports = async () => {
  const addr = process.env.ADDRESS || undefined
  const port = +process.env.PORT || undefined
  const server = new Server()

  await server.start(port, addr)
}
