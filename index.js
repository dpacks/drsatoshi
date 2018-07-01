var dPackLogger = require('@dpack/logger')
var output = require('@dpack/logger/result')
var dPackJobs = require('@dpack/jobs')
var exec = require('child_process').exec
var crypto = require('crypto')
var os = require('os')
var chalk = require('chalk')
var Menu = require('menu-string')
var debug = require('debug')('@dpack/jobs')
var defaultTasks = require('./lib/tasks-default')
var peerTasks = require('./lib/tasks-peer')
var peerTest = require('./lib/peer-test')

var NODE_VER = process.version
var DOCTOR_VER = require('./package.json').version
var DPACK_PROCESS = process.title === 'dpack'

module.exports = function (opts) {
  if (!opts) opts = {}
  opts.peerId = opts.peerId || null
  opts.port = typeof opts.port === 'number' ? opts.port : 3282

  var views = [headerOutput, versionsOutput, menuView]
  var dPackLog = dPackLogger(views)
  dPackLog.use(getVersions)

  if (opts.peerId) return runP2P() // run p2p tests right away

  var menu = Menu([
    'Basic Tests (Checks your dPack installation and network setup)',
    'Peer-to-Peer Test (Debug connections between two computers)'
  ])
  dPackLog.use(function (state) {
    state.opts = opts
    state.port = opts.port
  })
  dPackLog.use(function (state, bus) {
    bus.emit('render')

    dPackLog.input.on('down', function () {
      menu.down()
      bus.render()
    })
    dPackLog.input.on('up', function () {
      menu.up()
      bus.render()
    })
    dPackLog.input.once('enter', function () {
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
    var runTasks = dPackJobs(defaultTasks(opts))
    views.push(runTasks.view)
    dPackLog.use(runTasks.use)
    dPackLog.use(function (state, bus) {
      bus.once('done', function () {
        var testCountMsg = output(`
          ${chalk.bold(state.pass)} of ${chalk.bold(state.totalCount)} tests passed
        `)
        console.log('\n')
        if (state.fail === 0) {
          console.log(output(`
            ${chalk.bold.greenBright('SUCCESS!')}
            ${testCountMsg}
            Use Peer-to-Peer tests to check direct connections between two computers.
          `))
          process.exit(0)
        }
        console.log(output(`
          ${chalk.bold.redBright('FAIL')}
          ${testCountMsg}

          Your network may be preventing you from using dPack.
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
      return startTasks()
    }

    opts.existingTest = false
    opts.id = crypto.randomBytes(32).toString('hex')
    startTasks()

    function startTasks () {
      var runTasks = dPackJobs(peerTasks(opts))
      views.push(runTasks.view)
      dPackLog.use(runTasks.use)
      dPackLog.use(function (state, bus) {
        // initial tasks done
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
    return `Welcome to dPack's ${chalk.greenBright('Dr. Satoshi')} \n`
  }

  function menuView (state) {
    if (!menu) return ''
    if (state.selected && state.selected.index === 0) return `Running ${state.selected.text}\n`
    else if (state.selected) {
      return output(`
        To start a new Peer-to-Peer test, press ENTER.
        Otherwise enter test ID.

        >
      `)
    }
    return output(`
      Which tests would you like to run?
      ${menu.toString()}
    `)
  }

  function versionsOutput (state) {
    if (!state.versions) return ''
    var version = state.versions
    return output(`
      Software Info:
        ${os.platform()} ${os.arch()}
        Node ${version.node}
        Dr. Satoshi v${version.satoshi}
        ${dpackVer()}
    `) + '\n'

    function dpackVer () {
      if (!DPACK_PROCESS || !version.dpack) return ''
      return chalk.green(`dPack v${version.dpack}`)
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
        // dPack not installed/executable
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
