const net = require('net')
const util = require('./util')

const [localAddr, localPort] = process.argv.slice(2)
const server = net.createServer()

server
  .on('connection', sock => {
    // const fromPeer = (
    //   sock.remoteAddress === peerAddr &&
    //   sock.remotePort === +peerPort
    // )

    // if (!fromPeer) return

    util.log.info('Accepted inbound connection')
  })
  .on('error', err => util.log.error('[LISTENER]', err))
  .listen(+localPort, localAddr, () => console.log('listening'))
