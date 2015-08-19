/*jslint node: true, nomen: true */
"use strict";

var assert = require('assert');
var events = require('events');
var os = require('os');

//var SSDP = require('node-ssdp');
var SsdpServer = require('./lib/ssdp');

var url = require('url');
var util = require('util');
var _ = require('underscore');

var logger = require('./lib/logger');

var UPNPServer = require('./lib/upnpServer');
var PathRepository = require('./lib/repositories/pathRepository');
var MusicRepository = require('./lib/repositories/musicRepository');
var HistoryRepository = require('./lib/repositories/historyRepository');
var IceCastRepository = require('./lib/repositories/iceCastRepository');

/**
 * upnpserver API.
 *
 * @param {object}
 *            configuration
 * @param {array}
 *            paths
 *
 * @constructor
 */
var API = function(configuration, paths) {

  this.configuration = _.extend(this.defaultConfiguration, configuration);

  // TODO: move this on ContentDirectoryService
  this.directories = [];
  this._upnpClasses = {};
  this._contentHandlers = [];
  this._contentHandlersKey = 0;

  var self = this;
  if (typeof (paths) === "string") {
    this.addDirectory("/", paths);

  } else if (util.isArray(paths)) {
    paths.forEach(function(path) {
      self.initPaths(path);
    });
  }

  this.ip = this.configuration.ip ||
      this.getExternalIp(this.configuration.ipFamily, this.configuration.iface);

  if (this.configuration.noDefaultConfig !== true) {
    this.loadConfiguration("./default-config.json");
  }

  var cf = this.configuration.configurationFiles;
  if (typeof (cf) === "string") {
    this.loadConfigurationFile(cf);

  } else if (util.isArray(cf)) {
    for (var i = 0; i < cf.length; i++) {
      this.loadConfiguration(cf[i]);
    }
  }

  this.ssdpServer = new SsdpServer({
    logLevel : this.configuration.ssdpLogLevel,
    log : this.configuration.ssdpLog,
    ssdpSig: "Node/" + process.versions.node + " UPnP/1.0 " +
        "UPnPServer/" + require("./package.json").version
  });

};

util.inherits(API, events.EventEmitter);

/**
 * Default server configuration.
 *
 * @type {object}
 */
API.prototype.defaultConfiguration = {
  "dlnaSupport" : true,
  "httpPort" : 10293,
  "name" : "Node Server",
  "version" : require("./package.json").version
};

/**
 * Initialize paths.
 *
 * @param path
 * TODO: move this on ContentDirectoryService
 */
API.prototype.initPaths = function(path) {
  if (typeof (path) === "string") {
    this.addDirectory("/", path);
    return;
  }

  if (typeof (path) === "object") {
    var mountPoint = path.mountPoint || "/";

    var type = path.type && path.type.toLowerCase();

    switch (type) {
    case "music":
      if (!path.path) {
        throw new Error("Path must be defined '" + util.inspect(path) + "'")
      }
      this.addMusicDirectory(mountPoint, path.path);
      break;

    case "history":
      this.addHistoryDirectory(mountPoint);
      break;

    case "icecast":
      this.addIceCast(mountPoint);
      break;

    default:
      if (!path.path) {
        throw new Error("Path must be defined '" + util.inspect(path) + "'")
      }
      this.addDirectory(mountPoint, path.path);
    }
    return;
  }

  throw new Error("Invalid path '" + util.inspect(path) + "'");
};

/**
 * Add simple directory.
 *
 * @param {string}
 *            mountPoint
 * @param {string}
 *            path
 * TODO: move this on ContentDirectoryService
 */
API.prototype.addDirectory = function(mountPoint, path) {
  assert(typeof (mountPoint) === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");

  if (typeof (path) === "object") {
    // TODO
  }

  assert(typeof (path) === "string", "Invalid path parameter '" + mountPoint +
      "'");

  var repository = new PathRepository("path:" + path, mountPoint, path);

  this.addRepository(repository);
};

/**
 * Add a repository.
 *
 * @param {Repository}
 *            repository
 * TODO: move this on ContentDirectoryService
 */
API.prototype.addRepository = function(repository) {
  assert(repository, "Invalid repository parameter '" + repository + "'");

  this.directories.push(repository);
};

/**
 * Add music directory.
 *
 * @param {string}
 *            mountPoint
 * @param {string}
 *            path
 * TODO: move this on ContentDirectoryService
 */
API.prototype.addMusicDirectory = function(mountPoint, path) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");
  assert(typeof path === "string", "Invalid path parameter '" + mountPoint +
      "'");

  var repository = new MusicRepository("music:" + path, mountPoint, path);

  this.addRepository(repository);
};

/**
 * Add history directory.
 *
 * @param {string}
 *            mountPoint
 * TODO: move this on ContentDirectoryService
 */
API.prototype.addHistoryDirectory = function(mountPoint) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");

  var repository = new HistoryRepository(null, mountPoint);

  this.addRepository(repository);
};

/**
 * Add iceCast.
 *
 * @param {string}
 *            mountPoint
 * @param {object}
 *            medias (icecasts medias)
 * TODO: move this on ContentDirectoryService
 */
API.prototype.addIceCast = function(mountPoint) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");

  var repository = new IceCastRepository("iceCast", mountPoint);

  this.addRepository(repository);
};

API.prototype.loadConfiguration = function(path) {
  var config = require(path);

  var self = this;

  var upnpClasses = config.upnpClasses;
  if (upnpClasses) {
    for ( var upnpClassName in upnpClasses) {
      var path = upnpClasses[upnpClassName];

      var clazz = require(path);

      self._upnpClasses[upnpClassName] = new clazz();
    }
  }

  var contentHandlers = config.contentHandlers;
  if (contentHandlers) {
    var cs = self._contentHandlers;

    contentHandlers.forEach(function(contentHandler) {

      var mimeTypes = contentHandler.mimeTypes || [];

      if (contentHandler.mimeType) {
        mimeTypes = mimeTypes.slice(0);
        mimeTypes.push(contentHandler.mimeType);
      }

      var clazz = require(contentHandler.require);

      var configuration = contentHandler.configuration || {};

      var ch = new clazz(configuration);
      ch.key = contentHandler.key || cs.length;
      ch.priority = contentHandler.priority || 0;
      ch.mimeTypes = mimeTypes;

      cs.push(ch);
    });
  }

  var directories = config.directories;
  if (directories) {
    for ( var key in directories) {
      var directory = directories[key];

      var mountPoint = directory.mountPoint;

      self.addDirectory(mountPoint, directory);
    }
  }
}

/**
 * Start server.
 */
API.prototype.start = function() {
  var self = this;
  this.stop(function() {
    self.startServer();
  });
};

/**
 * Start server callback.
 *
 * @return {UPNPServer}
 */
API.prototype.startServer = function(callback) {

  if (!this.directories.length) {
    return callback(new Error("No directories defined !"));
  }

  var configuration = this.configuration;
  configuration.repositories = this.directories;
  configuration.upnpClasses = this._upnpClasses;
  configuration.contentHandlers = this._contentHandlers;
  configuration.contentProviders = this._contentProviders;

  var self = this;

  if (!callback) {
    callback = function() {
    };
  }

  var upnpServer = new UPNPServer(self.ssdpServer, self.ip, configuration,
      function(error, upnpServer) {
        if (error) {
          logger.error(error);

          return callback(error);
        }

        self._upnpServerStarted(upnpServer, callback);
      });

  return upnpServer;
};

/**
 * After server start.
 *
 * @param {object}
 *            upnpServer
 */
API.prototype._upnpServerStarted = function(upnpServer, callback) {

  this.emit("starting");

  this.upnpServer = upnpServer;

  var self = this;

  self.ssdpServer.start();

  callback();

};


/**
 * Stop server.
 *
 * @param {function|null}
 *            callback
 */
API.prototype.stop = function(callback) {
  callback = callback || function() {
    return false;
  };

  var httpServer = this.httpServer;
  var ssdpServer = this.ssdpServer;
  var stopped = false;

  if (this.ssdpServer) {
  //this.ssdpServer = undefined;
    stopped = true;

    try {
      ssdpServer.stop();

    } catch (error) {
      logger.error(error);
    }
  }

  if (httpServer) {
    this.httpServer = undefined;
    stopped = true;

    try {
      httpServer.stop();

    } catch (error) {
      logger.error(error);
    }
  }

  if (stopped) {
    this.emit("stopped");
  }

  callback(null, stopped);
};


/**
 * Get first available external ip.
 *
 * @param {string|null}
 *            ipFamily in [IPv4|IPv6] default : IPv4
 *
 * @param {string|null}
 *            iface : network interface name
 */
API.prototype.getExternalIp = function (ipFamily, iface) {

    var self = this
    ,   ifaces = os.networkInterfaces()
    ,   family = ipFamily || 'IPv4'
    ;

    for (var dev in ifaces) {
        var devs = ifaces[dev]
        if (iface && dev != iface) {
          continue
        }
        for (var di in devs) {
            var ni = devs[di]

            if (ni.family != family) {
                continue
            }

            if (ni.address == '::1') {
                continue
            }

            if (ni.address == '127.0.0.1') {
                continue
            }

            if (ni.internal) {
                continue
            }

            return ni.address;

        }
    }
    logger.error("Unable to find an external ip adress, use 127.0.0.1");
    return '127.0.0.1';
}


module.exports = API;
