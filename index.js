'use strict'

const fs = require('fs')
const path = require('path')
const Server = require('./lib/server')

const priv = path.join(__dirname, 'private')
const cert = fs.readFileSync(path.join(priv, 'cert.pem'))
const key = fs.readFileSync(path.join(priv, 'key.pem'))

const host = process.env.HOST || undefined
const port = +process.env.PORT || undefined
const server = new Server({ cert, key })

server
  .start(port, host)
  .then(() => {
    console.log(`Server listening on "${server.host}:${server.port}"`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
