'use strict'

const singleMetric = require('@telemetry-js/metric').single
const match = require('@telemetry-js/match-metric-names')
const EventEmitter = require('events').EventEmitter
const drivelist = require('drivelist')
const diskusage = require('diskusage')
const after = require('after')

const ALL_METRICS = [
  'telemetry.disk.free.bytes',
  'telemetry.disk.free.percent',
  'telemetry.disk.available.bytes',
  'telemetry.disk.available.percent',
  'telemetry.disk.total.bytes'
]

module.exports = function (options) {
  return new DiskCollector(options)
}

class DiskCollector extends EventEmitter {
  constructor (options) {
    if (!options) options = {}
    super()

    this._devices = new Set()
    this._metrics = new Set(match(ALL_METRICS, options.metrics))
    this._percentOptions = { unit: 'percent' }
    this._byteOptions = { unit: 'bytes' }
  }

  start (callback) {
    this._devices.clear()

    drivelist.list((err, drives) => {
      if (err) return callback(err)

      for (const drive of drives) {
        if (drive.mountpoints == null || drive.mountpoints.length === 0) {
          continue
        }

        const path = drive.mountpoints[0].path

        if (process.platform === 'win32') {
          if (/^[a-z]:\\$/i.test(path)) {
            this._devices.add(path.slice(0, 2)) // E.g. "C:"
          }
        } else if (path) {
          this._devices.add(path) // E.g. "/"
        }
      }

      callback()
    })
  }

  // TODO: reuse metric objects between pings
  ping (callback) {
    const next = after(this._devices.size, callback)

    for (const device of this._devices) {
      diskusage.check(device, (err, info) => {
        if (err) {
          console.error(err) // TODO: tbd
          return next()
        }

        if (this._metrics.has('telemetry.disk.free.bytes')) {
          const metric = singleMetric('telemetry.disk.free.bytes', this._byteOptions)
          metric.tags.device = device
          metric.record(info.free)
          this.emit('metric', metric)
        }

        if (this._metrics.has('telemetry.disk.free.percent')) {
          const metric = singleMetric('telemetry.disk.free.percent', this._percentOptions)
          metric.tags.device = device
          metric.record(info.free / info.total * 100)
          this.emit('metric', metric)
        }

        if (this._metrics.has('telemetry.disk.available.bytes')) {
          const metric = singleMetric('telemetry.disk.available.bytes', this._byteOptions)
          metric.tags.device = device
          metric.record(info.available)
          this.emit('metric', metric)
        }

        if (this._metrics.has('telemetry.disk.available.percent')) {
          const metric = singleMetric('telemetry.disk.available.percent', this._percentOptions)
          metric.tags.device = device
          metric.record(info.available / info.total * 100)
          this.emit('metric', metric)
        }

        if (this._metrics.has('telemetry.disk.total.bytes')) {
          const metric = singleMetric('telemetry.disk.total.bytes', this._byteOptions)
          metric.tags.device = device
          metric.record(info.total)
          this.emit('metric', metric)
        }

        next()
      })
    }
  }
}
