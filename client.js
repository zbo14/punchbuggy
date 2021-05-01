'use strict'

const Client = require('./lib/client')

const client = new Client()
const addr = process.env.ADDR || undefined
const port = +process.env.PORT || undefined

const main = async () => {
  await client.connectUDP(addr, port)
}

main().catch(err => {
  console.error(err)
  process.exit(err)
})
