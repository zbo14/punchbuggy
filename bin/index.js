#!/usr/bin/env node

'use strict'

const client = require('./client')
const server = require('./server')
const util = require('../lib/util')

const main = async () => {
  const mode = (process.argv[2] || '').trim().toLowerCase()

  if (!mode) {
    throw new Error('Please specify mode')
  }

  if (mode === 'client') {
    await client()
  } else if (mode === 'server') {
    await server()
  } else {
    throw new Error('Unrecognized mode: ' + mode)
  }
}

main().catch(err => {
  util.log.error(err)
  process.exit(1)
})
