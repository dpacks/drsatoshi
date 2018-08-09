var flock = require('@flockcore/revelation')
var pump = require('pump')
var defaults = require('@flockcore/presets')()
var thunky = require('thunky')
var debug = require('debug')('drsatoshi')

module.exports = runPublicPeerTest

function runPublicPeerTest (state, bus, opts, cb) {
  var address = opts.address
  var port = opts.port || 6200

  var connected = false
  var dataEcho = false

  var sw = flock({
    dns: {
      servers: defaults.dns.server
    },
    whitelist: [address],
    dht: false,
    hash: false,
    utp: opts.utp,
    tcp: opts.tcp
  })

  sw.on('error', function () {
    if (port === 53) bus.emit('error', `Default dWeb port did not work (${port}), using random port`)
    else bus.emit('error', `Specified port did not work (${port}), using random port`)
    sw.listen(0)
  })
  sw.listen(port)

  sw.on('listening', function () {
    state.title = 'Looking for Dr Satoshi on the dWeb network...'
    sw.join('satoshi', {announce: false})
    sw.on('connecting', function (peer) {
      state.title = `Connecting to Dr Satoshi, ${peer.host}:${peer.port}`
      debug('Trying to connect to Dr Satoshi, %s:%d', peer.host, peer.port)
    })
    sw.on('peer', function (peer) {
      state.title = `Discovered Dr Satoshi, ${peer.host}:${peer.port}`
      debug('Discovered Dr Satoshi, %s:%d', peer.host, peer.port)
    })
    sw.on('connection', function (connection) {
      connected = true
      state.title = `Connected to Dr Satoshi!`
      debug('Connection established to Dr Satoshi')
      connection.setEncoding('utf-8')
      connection.on('data', function (remote) {
        dataEcho = true
        state.title = `Successful data transfer with Dr Satoshi via ${opts.tcp ? 'TCP' : 'UDP'}`
        destroy(cb)
      })
      pump(connection, connection, function () {
        debug('Connection closed')
        destroy(cb)
      })
    })
    // debug('Attempting connection to satoshi, %s', satoshi)
    setTimeout(function () {
      if (connected) return
      bus.emit('error', 'Connection timed out.')
      destroy(cb)
    }, 10000)
    var destroy = thunky(function (done) {
      sw.destroy(function () {
        if (connected && dataEcho) return done()
        state.title = `Public Peer Test via ${opts.tcp ? 'TCP' : 'UDP'} Failed`
        if (!connected) {
          done('Unable to connect to dWeb public server')
        }
        if (!dataEcho) {
          done('Data was not echoed back from public server')
        }
        done()
      })
    })
  })
}
