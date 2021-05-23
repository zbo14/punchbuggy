const fs = require('fs')
const path = require('path')
const Server = require('../../lib/server')

const privateDir = path.resolve(__dirname, '..', '..', 'private')

module.exports = async () => {
  const addr = process.env.ADDRESS || undefined
  const port = +process.env.PORT || undefined

  const [cert, key] = await Promise.all([
    fs.promises.readFile(path.join(privateDir, 'cert.pem')),
    fs.promises.readFile(path.join(privateDir, 'key.pem'))
  ])

  const server = new Server({ cert, key })

  await server.listen(port, addr)
}
