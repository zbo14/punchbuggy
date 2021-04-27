'use strict'

const Client = require('./lib/client')

const client = new Client()
const host = process.env.HOST || undefined
const name = process.env.NAME || ''
const port = +process.env.PORT || undefined

const main = async () => {
  await client.connect(host, port)
  await client.sendMyName(name)
}

main().catch(err => {
  console.error(err)
  process.exit(err)
})
