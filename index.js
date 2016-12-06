var path = require("path")
var fs = require("fs")
var http = require("http")
var url = require("url")

var hock = require("hock")
var extend = require("util-extend")

var predefinedMocks = require("./lib/predefines.js").predefinedMocks


module.exports = start
function start (options, cb) {
  var minReq = options.minReq === undefined ? 0 : options.minReq
  var maxReq = options.maxReq === undefined ? Infinity : options.maxReq
  var port = options.port === undefined ? 1331 : options.port
  var mocks = options.mocks === undefined ? {} : options.mocks
  var plugin = options.plugin === undefined ? function () {} : options.plugin

  var mock = hock.createHock(options)
  http.createServer(mock.handler).listen(port, function (err) {
    var realUrl = 'http://localhost:' + this.address().port

    mocks = extendRoutes(mocks)

    // default headers must be set before invoking plugins so that
    // newly-enqueued requests inherit those default headers
    mock.defaultReplyHeaders({ connection: 'close' })
    plugin(mock)

    Object.keys(mocks).forEach(function (method) {
      Object.keys(mocks[method]).forEach(function (route) {
        var status = mocks[method][route][0]
        var customTarget = mocks[method][route][1]
        var target

        if (customTarget && typeof customTarget === "string")
          target = customTarget
        else
          target = __dirname + "/fixtures" + route
        fs.lstat(target, function (err, stats) {
          if (err) return next()
          if (stats.isDirectory()) return next()
          return mock[method](route)
            .many({max: maxReq, min: minReq})
            .replyWithFile(status, target)
        })

        function replaceRegistry (res) {
          return JSON.stringify(res)
                  .replace(/http:\/\/registry\.npmjs\.org/ig, realUrl)
        }

        function next () {
          var res
          if (!customTarget) {
            res = require(__dirname + "/fixtures" + route)
            res = replaceRegistry(res)

            return mock[method](route)
              .many({max: maxReq, min: minReq})
              .reply(status, res)
          }

          try {
            res = require(customTarget)
          } catch (e) {
            res = customTarget
          }

          res = replaceRegistry(res)
          mock[method](route)
            .many({max: maxReq, min: minReq})
            .reply(status, res)
        }
      })
    })
    cb && cb(null, this)
  })
}

function extendRoutes (mocks) {
  for (var method in mocks) {
    predefinedMocks[method] = extend(predefinedMocks[method], mocks[method])
  }
  return predefinedMocks
}
