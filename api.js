/*jslint node: true, nomen: true */
"use strict";

var assert = require('assert');
var events = require('events');
var http = require('http');
var ip = require('ip');
var SSDP = require('node-ssdp');
var url = require('url');
var util = require('util');
var _ = require('underscore');

var logger = require('./lib/logger');

var UPNPServer = require('./lib/upnpServer');
var PathRepository = require('./lib/repositories/pathRepository');
var MusicRepository = require('./lib/repositories/musicRepository');
var HistoryRepository = require('./lib/repositories/historyRepository');

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
 */
API.prototype.addHistoryDirectory = function(mountPoint) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");

  var repository = new HistoryRepository(null, mountPoint);

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

  var upnpServer = new UPNPServer(configuration.httpPort, configuration,
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

  var descriptionPath = upnpServer.descriptionPath.replace(/^\//, '');
  var locationURL = 'http://' + ip.address() + ':' +
      this.configuration.httpPort + "/" + descriptionPath;

  var self = this;

  var ssdpServer = new SSDP.Server({
    logLevel : self.configuration.ssdpLogLevel, // 'trace',
    log : self.configuration.ssdpLog,
    udn : self.upnpServer.uuid,
    description : descriptionPath,
    location : locationURL
  });
  this.ssdpServer = ssdpServer;

  ssdpServer.addUSN('upnp:rootdevice');
  ssdpServer.addUSN(upnpServer.type);

  var self = this;

  var services = upnpServer.services;
  if (services) {
    services.forEach(function(service) {
      ssdpServer.addUSN(service.type);
    });
  }

  var httpServer = http.createServer();
  this.httpServer = httpServer;

  httpServer.on('request', this._processRequest.bind(this));

  var self = this;
  httpServer.listen(upnpServer.port, function(error) {
    if (error) {
      return callback(error);
    }

    self.ssdpServer.start();

    self.emit("waiting");

    var address = httpServer.address();

    var hostname = address.address;
    if (address.family === 'IPv6') {
      hostname = '[' + hostname + ']';
    }

    console.log('Ready http://' + hostname + ':' + address.port);

    callback();
  });
};

/**
 * Process request
 * 
 * @param {object}
 *            request
 * @param {object}
 *            response
 */
API.prototype._processRequest = function(request, response) {

  var path = url.parse(request.url).pathname;

  // logger.debug("Uri=" + request.url);

  var now = Date.now();
  var self = this;
  try {
    this.upnpServer.processRequest(request, response, path, function(error,
        processed) {

      var stats = {
        request : request,
        response : response,
        path : path,
        processTime : Date.now() - now,
      }

      if (error) {
        response.writeHead(500, 'Server error: ' + error);
        response.end();

        self.emit("code:500", error, stats);
        return;
      }

      if (!processed) {
        response.writeHead(404, 'Resource not found: ' + path);
        response.end();

        self.emit("code:404", stats);
        return;
      }

      self.emit("code:200", stats);
    });

  } catch (error) {
    logger.error("Process request exception", error);
    this.emit("error", error);
  }
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
    this.ssdpServer = undefined;
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

module.exports = API;
