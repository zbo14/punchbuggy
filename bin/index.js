#!/usr/bin/env node

'use strict'

const commands = require('./commands')
const util = require('../lib/util')

const main = async () => {
  const cmd = (process.argv[2] || '').trim().toLowerCase()

  if (!cmd) {
    throw new Error('Please specify command')
  }

  switch (cmd) {
    case 'dial':
    case 'listen':
    case 'test':
      await commands[cmd]()
      return

    default:
      throw new Error('Unrecognized command: ' + cmd)
  }
}

main().catch(err => {
  util.log.error(err)
  process.exit(1)
})
