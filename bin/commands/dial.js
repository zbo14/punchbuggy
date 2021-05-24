const readline = require('readline')
const Client = require('../../lib/client')
const util = require('../../lib/util')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = prompt => new Promise(resolve => {
  rl.question(prompt, resolve)
})

module.exports = async () => {
  const enableChat = (process.env.ENABLE_CHAT || '').trim().toLowerCase() === 'true'
  const addr = process.env.SERVER_ADDRESS || undefined
  const port = +process.env.SERVER_PORT || undefined

  const client = new Client()

  await client.connectToServer(addr, port)
  await client.requestId()

  while (true) {
    const sid = await question('Enter peer session ID: ')

    try {
      await client.requestInfo(sid)
      break
    } catch (err) {
      util.log.error(err.message)
    }
  }

  await client.dialPeer()
  const sock = client.ejectUDPSocket()

  if (!enableChat) {
    sock.close()
    client.logInfo('Closed UDP socket')
    client.logInfo('You may continue communication over UDP')
    client.logInfo(`Mapping: 0.0.0.0:${client.localPort} -> ${client.peerAddr}:${client.peerPort}`)
    process.exit()
  }

  client.logInfo('Type a message and press "enter" to send!')
  client.logInfo('Messages received will appear below')

  sock.on('message', (buf, rinfo) => {
    client.logInfo('Message from peer:', buf.toString())
  })

  while (true) {
    const msg = (await question('')).trim()
    msg && sock.send(msg, client.peerPort, client.peerAddr)
  }
}
