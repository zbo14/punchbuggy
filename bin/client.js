const readline = require('readline')
const UDPClient = require('../lib/udp-client')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = prompt => new Promise(resolve => {
  rl.question(prompt, resolve)
})

module.exports = async () => {
  const client = new UDPClient()
  const addr = process.env.SERVER_ADDRESS || undefined
  const port = +process.env.SERVER_PORT || undefined

  await client.start(addr, port)
  await client.requestId()
  const sid = await question('Enter peer session ID: ')

  await client.requestConnect(sid)

  client.dial()
}
