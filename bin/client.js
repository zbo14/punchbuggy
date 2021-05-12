const readline = require('readline')
const Client = require('../lib/client')

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
  const proto = process.env.PROTOCOL || 'udp'

  const client = new Client(proto)

  await client.connectToServer(addr, port)
  await client.requestId()
  const sid = await question('Enter peer session ID: ')

  await client.requestConnect(sid)
  await client.dialPeer()
  const sock = client.ejectSocket()

  if (client.isTCP) {
    sock.setEncoding('utf8')

    sock.on('data', msg => {
      client.logInfo('Message from peer: ' + msg)
    })

    while (true) {
      const msg = await question('')
      sock.write(msg)
    }

    return
  }

  sock.on('message', (buf, rinfo) => {
    client.logInfo(`Message from \`${rinfo.address}:${rinfo.port}\`: ${buf.toString()}`)
  })

  while (true) {
    const msg = await question('')
    sock.send(msg, client.peerPort, client.peerAddr)
  }
}
