var assert = require('assert');
var events = require('events');
var http = require('http');
var SSDP = require('node-ssdp');
var url = require('url');
var util = require('util');

var UPNPServer = require('./lib/upnpServer');
var PathRepository = require('./lib/pathRepository');
var MusicRepository = require('./lib/musicRepository');

var API = function(configuration, paths) {
  assert(configuration === undefined || typeof (configuration) == "object",
      "Invalid configuration parameter '" + configuration + "'");

  this.configuration = configuration || {};

  configuration.version = require("./package.json").version;

  if (!configuration.repositories) {
    configuration.repositories = [];
  }
  configuration.name = configuration.name || "Node Server";
  configuration.uuid = configuration.uuid
      || "142f98b7-c28b-4b6f-8ca2-b55d9f0657e3";

  configuration.httpPort = configuration.httpPort || 10293;

  if (configuration.dlnaSupport !== false) {
    configuration.dlnaSupport = true;
  }

  if (paths) {
    if (typeof (paths) == "string") {
      this.addDirectory("/", paths);

    } else if (util.isArray(paths)) {
      var self = this;

      paths.forEach(function(p) {
        if (typeof (p) == "string") {
          self.addDirectory("/", p);
          return;
        }

        if (typeof (p) == "object" && p.path) {
          var mountPoint = p.mountPoint || "/";
          var type = p.type && p.type.toLowerCase();

          if (type == "music") {
            self.addMusicDirectory(mountPoint, p.path);
            return;
          }

          self.addDirectory(mountPoint, p.path);
          return;
        }

        console.error("Invalid path '" + p + "'");
      });
    }
  }

};
module.exports = API;

util.inherits(API, events.EventEmitter);

API.prototype.addDirectory = function(mountPoint, path) {
  assert(typeof (mountPoint) == "string", "Invalid mountPoint parameter '"
      + mountPoint + "'");
  assert(typeof (path) == "string", "Invalid path parameter '" + mountPoint
      + "'");

  var repository = new PathRepository("path:" + path, mountPoint, path);

  this.configuration.repositories.push(repository);
};

API.prototype.addMusicDirectory = function(mountPoint, path) {
  assert(typeof (mountPoint) == "string", "Invalid mountPoint parameter '"
      + mountPoint + "'");
  assert(typeof (path) == "string", "Invalid path parameter '" + mountPoint
      + "'");

  var repository = new MusicRepository("music:" + path, mountPoint, path);

  this.configuration.repositories.push(repository);
};

API.prototype.start = function(callback) {
  callback = callback || function() {
  };

  var self = this;

  this.stop(function() {
    var upnpServer = new UPNPServer(self.configuration.httpPort,
        self.configuration, function(error, upnpServer) {
          if (error) {
            callback(error);
            return;
          }

          self.emit("starting");

          var descURL = upnpServer.descriptionPath;
          if (descURL.charAt(0) == "/") {
            descURL = descURL.substring(1);
          }

          var ssdpServer = new SSDP({
            logLevel : self.configuration.ssdpLevel, // 'trace',
            log : self.configuration.ssdpLog,
            udn : upnpServer.uuid,
            description : descURL
          });
          self.ssdpServer = ssdpServer;

          ssdpServer.addUSN('upnp:rootdevice');
          ssdpServer.addUSN(upnpServer.type);

          upnpServer.services.forEach(function(service) {
            ssdpServer.addUSN(service.type);
          });

          ssdpServer.on('advertise-alive', function(heads) {
            // console.log('advertise-alive', heads);
            // Expire old devices from your cache.
            // Register advertising device somewhere (as designated in http headers
            // heads)
          });

          ssdpServer.on('advertise-bye', function(heads) {
            // console.log('advertise-bye', heads);
            // Remove specified device from cache.
          });

          var httpServer = http.createServer(function(request, response) {
            var path = url.parse(request.url).pathname;

            // console.log("Uri=" + request.url);

            try {
              upnpServer.processRequest(request, response, path, function(
                  error, processed) {
                // console.log("End of request ", error, processed);

                if (error) {
                  response.writeHead(500, 'Server error: ' + error);
                  response.end();

                  self.emit("error:500", error);
                  return;
                }

                if (!processed) {
                  response.writeHead(404, 'Resource not found: ' + path);
                  response.end();

                  self.emit("error:404", path);
                  return;
                }
              });
            } catch (x) {
              console.error("Process request exception", x);
              self.emit("error", x);
            }
          });
          self.httpServer = httpServer;

          httpServer.listen(upnpServer.port);

          ssdpServer.server('0.0.0.0', upnpServer.port);

          self.emit("waiting");

          callback(null);
        });

    self.upnpServer = upnpServer;
  });
};

API.prototype.stop = function(callback) {
  callback = callback || function() {
  };

  var upnpServer = this.upnpServer;
  var stopped = false;

  var ssdpServer = this.ssdpServer;
  if (ssdpServer) {
    this.ssdpServer = undefined;
    stopped = true;

    try {
      ssdpServer.stop();
    } catch (x) {
      // console.error(x);
    }
  }

  var httpServer = this.httpServer;
  if (httpServer) {
    this.httpServer = undefined;
    stopped = true;

    try {
      httpServer.stop();
    } catch (x) {
      // console.error(x);
    }
  }

  if (stopped) {
    this.emit("stopped");
  }

  callback(null, stopped);
}
