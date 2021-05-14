const readline = require('readline')
const Client = require('../lib/client')
const util = require('../lib/util')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = prompt => new Promise(resolve => {
  rl.question(prompt, resolve)
})

module.exports = async () => {
  const addr = process.env.SERVER_ADDRESS || undefined
  const port = +process.env.SERVER_PORT || undefined

  const client = new Client()

  await client.connectToServer(addr, port)
  await client.requestId()
  const sid = await question('Enter peer session ID: ')

  await client.requestConnect(sid)
  const sock = await client.dialPeer()

  sock.on('message', (buf, rinfo) => {
    client.logInfo(`Message from \`${rinfo.address}:${rinfo.port}\`: ${buf.toString()}`)
  })

  while (true) {
    const msg = await question('')
    sock.send(msg, client.peerPort, client.peerAddr)
  }
}
