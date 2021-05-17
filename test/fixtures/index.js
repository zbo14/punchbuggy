const fs = require('fs')
const path = require('path')

const cert = fs.readFileSync(path.join(__dirname, 'cert.pem'))
const key = fs.readFileSync(path.join(__dirname, 'key.pem'))

module.exports = {
  cert,
  key
}
