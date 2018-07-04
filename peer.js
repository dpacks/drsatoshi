#!/usr/bin/env node

// this is the peer at 'satoshi1.dwebs.io'

var dWebChannel = require('@dwcore/channel')
var dWebFlock = require('@flockcore/core')
var dWebFlockDefaults = require('@flockcore/presets')()
var crypto = require('crypto')

var flock = dWebFlock({
  dns: {
    servers: dWebFlockDefaults.dns.server
  },
  hash: false,
  dht: false
})

flock.on('error', function () {
  flock.listen(0)
})
flock.listen(8887)
flock.on('listening', function () {
  flock.join('dWeb Public Peer')
  flock.on('connecting', function (peer) {
    console.log('Trying to connect to %s:%d', peer.host, peer.port)
  })
  flock.on('peer', function (peer) {
    console.log('Revelated %s:%d', peer.host, peer.port)
  })
  flock.on('connection', function (connection) {
    var data = crypto.randomBytes(16).toString('hex')
    console.log('Connection established to remote peer')
    connection.setEncoding('utf-8')
    connection.write(data)
    connection.on('data', function (remote) {
      console.log('Got data back from peer %s', remote.toString())
      connection.destroy()
    })
    dWebChannel(connection, connection, function () {
      console.log('Connection closed')
    })
  })
  console.log('Waiting for incoming connections... (local port: %d)', flock.address().port)
})
