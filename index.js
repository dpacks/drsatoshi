var exec = require('child_process').exec
var crypto = require('crypto')
var os = require('os')
var dPackLogger = require('@dpack/logger')
var result = require('@dpack/logger/result')
var dPackJobs = require('@dpack/jobs')
var chalk = require('chalk')
var Menu = require('menu-string')
var debug = require('debug')('drsatoshi')
var defaultJobs = require('./lib/jobs-default')
var peerJobs = require('./lib/jobs-peer')
var peerTest = require('./lib/peer-test')

var NODE_VER = process.version
var DOCTOR_VER = require('./package.json').version
var DPACK_PROCESS = process.title === 'dpack'

module.exports = function (opts) {
  if (!opts) opts = {}
  opts.peerId = opts.peerId || null
  opts.port = typeof opts.port === 'number' ? opts.port : 6620

  var views = [headerOutput, versionsOutput, menuView]
  var log = dPackLogger(views)
  log.use(getVersions)

  if (opts.peerId) return runP2P() // run p2p tests right away

  var menu = Menu([
    'Basic dPack Tests (Checks your dPack installation and network setup)',
    'dWeb P2P Network Test (Debug connections between two computers)'
  ])
  log.use(function (state) {
    state.opts = opts
    state.port = opts.port
  })
  log.use(function (state, bus) {
    bus.emit('render')

    log.input.on('down', function () {
      menu.down()
      bus.render()
    })
    log.input.on('up', function () {
      menu.up()
      bus.render()
    })
    log.input.once('enter', function () {
      state.selected = menu.selected()
      bus.render()
      startTests(state.selected)
    })
  })

  function startTests (selected) {
    if (selected.index === 0) return runBasic()
    else runP2P()
  }

  function runBasic () {
    var runJobs = dPackJobs(defaultJobs(opts))
    views.push(runJobs.view)
    log.use(runJobs.use)
    log.use(function (state, bus) {
      bus.once('done', function () {
        var testCountMsg = result(`
          ${chalk.bold(state.pass)} of ${chalk.bold(state.totalCount)} tests passed
        `)
        console.log('\n')
        if (state.fail === 0) {
          console.log(result(`
            ${chalk.bold.greenBright('SUCCESS!')}
            ${testCountMsg}
            Use Peer-to-Peer tests to check direct connections between two computers.
          `))
          process.exit(0)
        }
        console.log(result(`
          ${chalk.bold.redBright('FAIL')}
          ${testCountMsg}
          Your network may be preventing you from using Dat.
          For further troubleshooting, visit https://docs.dpack.io/issues
        `))
        process.exit(1)
      })
    })
  }

  function runP2P () {
    if (opts.peerId) {
      opts.existingTest = true
      opts.id = opts.peerId
      return startJobs()
    }

    opts.existingTest = false
    opts.id = crypto.randomBytes(32).toString('hex')
    startJobs()

    function startJobs () {
      var runJobs = dPackJobs(peerJobs(opts))
      views.push(runJobs.view)
      log.use(runJobs.use)
      log.use(function (state, bus) {
        // initial jobs done
        bus.once('done', function () {
          // TODO: Fix, overwriting previous line
          views.push(function () { return '\n' })
          bus.render()

          state.id = opts.id
          state.existingTest = opts.existingTest
          peerTest(state, bus, views)
        })
      })
    }
  }

  function headerOutput (state) {
    return `Welcome to ${chalk.greenBright('Dr Satoshi')} for dPack\n`
  }

  function menuView (state) {
    if (!menu) return ''
    if (state.selected && state.selected.index === 0) return `Running ${state.selected.text}\n`
    else if (state.selected) {
      return result(`
        To start a new Peer-to-Peer test, press ENTER.
        Otherwise enter test ID.
        >
      `)
    }
    return result(`
      Which tests would you like to run?
      ${menu.toString()}
    `)
  }

  function versionsOutput (state) {
    if (!state.versions) return ''
    var version = state.versions
    return result(`
      Software Info:
        ${os.platform()} ${os.arch()}
        Node ${version.node}
        Dr Satoshi v${version.doctor}
        ${dpackVer()}
    `) + '\n'

    function dpackVer () {
      if (!DPACK_PROCESS || !version.dpack) return ''
      return chalk.green(`dpack v${version.dpack}`)
    }
  }

  function getVersions (state, bus) {
    state.versions = {
      dpack: null,
      satoshi: DOCTOR_VER,
      node: NODE_VER
    }
    exec('dpack -v', function (err, stdin, stderr) {
      if (err && err.code === 127) {
        // Dat not installed/executable
        state.dpackInstalled = false
        return bus.emit('render')
      }
      // if (err) return bus.emit('render')
      // TODO: right now dpack -v exits with error code, need to fix
      state.versions.dpack = stderr.toString().split('\n')[0].trim()
      bus.emit('render')
    })
  }
}
