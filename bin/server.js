const fs = require('fs')
const path = require('path')
const Server = require('../lib/server')

module.exports = async () => {
  const addr = process.env.ADDRESS || undefined
  const port = +process.env.PORT || undefined
  const server = new Server()

  await server.start(port, addr)
}
