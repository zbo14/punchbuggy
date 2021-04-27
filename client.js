'use strict'

const Client = require('./lib/client')

const client = new Client()
const host = process.env.HOST || undefined
const port = +process.env.PORT || undefined

client
  .calculateDelta(host, port)
  .catch(err => {
    console.error(err)
    process.exit(err)
  })
