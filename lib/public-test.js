var dWebChannel = require('@dwcore/channel')
var dethunk = require('@dwcore/dethunk')
var dWebFlock = require('@flockcore/core')
var dWebFlockPresets = require('@flockcore/presets')()
var debug = require('debug')('@dpack/drsatoshi')

module.exports = runPublicPeerTest

function runPublicPeerTest (state, bus, opts, cb) {
  var address = opts.address
  var port = opts.port || 3282

  var connected = false
  var dataEcho = false

  var flock = dWebFlock({
    dns: {
      servers: dWebFlockPresets.dns.server
    },
    whitelist: [address],
    dht: false,
    hash: false,
    utp: opts.utp,
    tcp: opts.tcp
  })

  flock.on('error', function () {
    if (port === 3282) bus.emit('error', `Default dPack port did not work (${port}), using random port`)
    else bus.emit('error', `Specified port did not work (${port}), using random port`)
    flock.listen(0)
  })
  flock.listen(port)

  flock.on('listening', function () {
    state.title = 'Looking for Dr. Satoshi on the dWeb network...'
    flock.join('dweb-public-peer', {announce: false})
    flock.on('connecting', function (peer) {
      state.title = `Connecting to Dr. Satoshi, ${peer.host}:${peer.port}`
      debug('Trying to connect to Dr. Satoshi, %s:%d', peer.host, peer.port)
    })
    flock.on('peer', function (peer) {
      state.title = `Discovered Dr. Satoshi, ${peer.host}:${peer.port}`
      debug('Discovered Dr. Satoshi, %s:%d', peer.host, peer.port)
    })
    flock.on('connection', function (connection) {
      connected = true
      state.title = `Connected to Dr. Satoshi!`
      debug('Connection established to Dr. Satoshi')
      connection.setEncoding('utf-8')
      connection.on('data', function (remote) {
        dataEcho = true
        state.title = `Successful data transfer with Dr. Satoshi via ${opts.tcp ? 'TCP' : 'UDP'}`
        destroy(cb)
      })
      dWebChannel(connection, connection, function () {
        debug('Connection closed')
        destroy(cb)
      })
    })
    // debug('Attempting connection to doctor, %s', doctor)
    setTimeout(function () {
      if (connected) return
      bus.emit('error', 'Connection timed out.')
      destroy(cb)
    }, 10000)
    var destroy = dethunk(function (done) {
      flock.destroy(function () {
        if (connected && dataEcho) return done()
        state.title = `Public Peer Test via ${opts.tcp ? 'TCP' : 'UDP'} Failed`
        if (!connected) {
          done('Unable to connect to a dWeb public server')
        }
        if (!dataEcho) {
          done('dPack was not echoed back from public server')
        }
        done()
      })
    })
  })
}
