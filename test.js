const cp = require('child_process')
const { once } = require('events')
const net = require('net')
const path = require('path')

const modulePath = path.join(__dirname, 'lib', 'listener.js')

const main = async () => {
  const server = net.createServer()
  const promise = once(server, 'listening')

  server.listen(12345, 'localhost')

  await promise

  const sock = await new Promise((resolve, reject) => {
    const sock = net.connect(12345, 'localhost', () => {
      resolve(sock)
    }).once('error', reject)
  })

  const child = cp.fork(modulePath, [sock.localAddress, sock.localPort], { stdio: 'pipe' })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let ready

  child
    .on('error', console.error)
    .stderr.on('data', console.error)

  child.stdout.on('data', async str => {
      console.log(str)

      if (ready) return

      ready = true

      await new Promise((resolve, reject) => {
        const sock2 = net.connect(sock.localPort, sock.localAddress, () => {
          resolve(sock2)
        }).once('error', reject)
      })
    })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
