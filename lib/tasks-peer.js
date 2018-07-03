var dns = require('dns')
var chalk = require('chalk')
var debug = require('debug')('@dpack/drsatoshi')
var whoamiTest = require('./whoami-test')

module.exports = function (opts) {
  if (!opts) opts = {}

  var port = opts.port

  var jobs = [
    {
      title: 'Who am I?',
      job: function (state, bus, done) {
        state.port = port
        bus.on('error', function (err) {
          if (!state.output) state.output = '  ' + chalk.dim(err)
          else state.output += '\n  ' + chalk.dim(err)
        })
        whoamiTest(state, bus, done)
      }
    },
    {
      title: 'Checking dPack Native Module Installation',
      job: nativeModuleJob
    }
  ]

  return jobs

  function nativeModuleJob (state, bus, done) {
    try {
      require('utp-native')
      state.title = 'Loaded native modules'
    } catch (err) {
      state.title = 'Error loading native modules'
      // TODO: link to FAQ/More Help
      return done(`Unable to load utp-native.\n  This will make it harder to connect peer-to-peer.`)
    }
    done()
  }
}
