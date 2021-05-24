const Client = require('../../lib/client')
const util = require('../../lib/util')

module.exports = async () => {
  const addr1 = process.env.SERVER1_ADDRESS || undefined
  const port1 = +process.env.SERVER1_PORT || undefined

  const addr2 = process.env.SERVER2_ADDRESS || undefined
  const port2 = +process.env.SERVER2_PORT || undefined

  if (addr1 && addr2 && addr1 === addr2) {
    throw new Error('Must specify 2 different server addresses')
  }

  const client1 = new Client()

  await client1.connectToServer(addr1, port1)
  await client1.requestId()

  let resp1

  while (true) {
    try {
      resp1 = await client1.requestInfo()
      break
    } catch ({ message }) {
      util.log.error(message)
    }
  }

  const sock = client1.ejectUDPSocket()
  const client2 = new Client(sock)
  await client2.connectToServer(addr2, port2)
  await client2.requestId()

  let resp2

  while (true) {
    try {
      resp2 = await client2.requestInfo()
      break
    } catch ({ message }) {
      util.log.error(message)
    }
  }

  if (resp1.publicPort === resp2.publicPort) {
    client2.logInfo('>> Public ports are the same across servers')
    client2.logInfo('>> Awesome! UDP hole punching is supported')
  } else {
    client2.logWarning('>> Public ports are different across servers')
    client2.logWarning('>> UDP hole punching isn\'t supported on your current network')
  }

  sock.close()
  process.exit()
}
