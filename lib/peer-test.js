var dnsDiscovery = require('@distdns/server')
var result = require('@dpack/logger/result')
var dWebChannel = require('@dwcore/channel')
var dethunk = require('@dwcore/dethunk')
var dWebFlock = require('@flockcore/core')
var dWebFlockPresets = require('@flockcore/presets')()
var crypto = require('crypto')
var dns = require('dns')
var chalk = require('chalk')
var debug = require('debug')('@dpack/drsatoshi')

module.exports = p2pTest

function p2pTest (state, bus, views) {
  views.push(p2pView)

  var tick = 0
  state.peers = {}
  state.connecting = {}
  var flock = dWebFlock({
    dns: {
      servers: dWebFlockPresets.dns.server
    },
    dht: false
  })

  bus.on('connecting', function (peer) {
    var id = `${peer.host}:${peer.port}`
    if (state.connecting[id]) return
    state.connecting[id] = peer
    bus.emit('render')
  })
  bus.on('connection', function (prefix, info) {
    info.host = info.host.split(':').pop()
    var id = `${info.host}:${info.port}`
    if (state.connecting[id]) state.connecting[id].connected = true
    state.peers[prefix] = info
    bus.emit('render')
  })
  bus.on('echo', function (prefix) {
    state.peers[prefix].echo = true
    bus.emit('render')
  })

  flock.on('error', function () {
    flock.listen(0)
  })
  flock.listen(state.port)
  flock.on('listening', function () {
    bus.emit('render')
    flock.join(state.id)
    flock.once('connecting', function () {
      state.active = true
      bus.emit('render')
    })
    flock.on('connecting', function (peer) {
      bus.emit('connecting', peer)
    })
    flock.on('peer', function (peer) {
      debug('Discovered %s:%d', peer.host, peer.port)
    })
    flock.on('connection', function (connection, info) {
      var num = tick++
      var prefix = '0000'.slice(0, -num.toString().length) + num
      bus.emit('connection', prefix, info)

      var data = crypto.randomBytes(16).toString('hex')
      debug('[%s-%s] Connection established to remote peer', prefix, info.type)
      var buf = ''
      connection.setEncoding('utf-8')
      connection.write(data)
      connection.on('data', function (remote) {
        buf += remote
        if (buf.length === data.length) {
          bus.emit('echo', prefix)
          debug('[%s-%s] Remote peer echoed expected data back, success!', prefix, info.type)
        }
      })
      dWebChannel(connection, connection, function () {
        debug('[%s-%s] Connected closed', prefix, info.type)
        bus.emit('render')
      })
    })
  })

  function p2pView (state) {
    if (!state.id) return ''
    if (!state.existingTest) {
      return '\n' + result(`
        Running a new Peer-to-Peer test

        To check connectivity with another computer, run the command:

          ${testCmd()}

        ${peers()}
      `)
    }

    return result(`
      Joining existing Peer-to-Peer test:

        ${testCmd()}

      ${peers()}
    `)

    function testCmd () {
      return process.title === 'dpack' ? chalk.magentaBright(`satoshi ${state.id}`) : chalk.magentaBright(`satoshi ${state.id}`)
    }

    function peers () {
      if (!state.active) return 'Waiting for incoming connections...'
      return result(`
        ${Object.keys(state.peers).map(peerId => {
          var peer = state.peers[peerId]
          var address = `${peer.host}:${peer.port}`
          var prefix = `${address} (${peer.type.toUpperCase()})`
          if (peer.echo) return `${prefix} ${chalk.greenBright.bold('SUCCESS!')}`
          return `${prefix} connected, trying to exchange data`
        }).join('\n')}
        ${connecting()}
      `)

      function connecting () {
        var peers = Object.keys(state.connecting)
        if (!peers.length) return ''
        return '\n' + result(`
          Trying to Connect:
          ${peers.map(peer => {
            if (peer.connected) return ''
            return `  ${peer}`
          }).join('\n')}
        `)
      }
    }
  }
}