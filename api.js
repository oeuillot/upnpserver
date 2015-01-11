var _ = require('underscore')
  , assert = require('assert')
  , events = require('events')
  , http = require('http')
  , ip = require('ip')
  , logger = require('./lib/logger')
  , SSDP = require('node-ssdp')
  , url = require('url')
  , util = require('util');

var UPNPServer = require('./lib/upnpServer');
var PathRepository = require('./lib/repositories/pathRepository');
var MusicRepository = require('./lib/repositories/musicRepository');

/**
 * upnpserver API.
 *
 * @param {object} configuration
 * @param {array} paths
 *
 * @constructor
 */
var API = function (configuration, paths) {
  this.configuration = _.extend(this.defaultConfiguration, configuration);
  this.directories = [];

  if (!paths || paths.length === 0) {
    throw ("No paths!");
  }

  if (typeof paths === "string") {
    this.addDirectory("/", paths);
  } else if (util.isArray(paths)) {
    paths.forEach(_.bind(this.initPaths, this));
  }
};

util.inherits(API, events.EventEmitter);

/**
 * Default server configuration.
 * @type {object}
 */
API.prototype.defaultConfiguration = {
  "dlnaSupport": true,
  "httpPort": 10293,
  "name": "Node Server",
  "version": require("./package.json").version
};

/**
 * Initialize paths.
 *
 * @param path
 */
API.prototype.initPaths = function (path) {
  if (typeof path === "string") {
    this.addDirectory("/", path);
  } else if (typeof path === "object" && path.path) {
    var mountPoint = path.mountPoint || "/",
      type = path.type && path.type.toLowerCase();

    switch (type) {
    case "music":
      this.addMusicDirectory(mountPoint, path.path);
      break;
    default:
      this.addDirectory(mountPoint, path.path);
    }
  } else {
    throw ("Invalid path '" + path + "'");
  }
};

/**
 * Add simple directory.
 *
 * @param {string} mountPoint
 * @param {string} path
 */
API.prototype.addDirectory = function (mountPoint, path) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");
  assert(typeof path === "string", "Invalid path parameter '" + mountPoint +
      "'");

  var repository = new PathRepository("path:" + path, mountPoint, path);

  this.directories.push(repository);
};

/**
 * Add music directory.
 *
 * @param {string} mountPoint
 * @param {string} path
 */
API.prototype.addMusicDirectory = function(mountPoint, path) {
  assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
      mountPoint + "'");
  assert(typeof path === "string", "Invalid path parameter '" + mountPoint +
      "'");

  var repository = new MusicRepository("music:" + path, mountPoint, path);

  this.directories.push(repository);
};

/**
 * Start server.
 */
API.prototype.start = function () {
  this.stop(_.bind(this.startServer, this));
};

/**
 * Start server callback.
 *
 * @return {UPNPServer}
 */
API.prototype.startServer = function () {
  var configuration = this.configuration;
  configuration.repositories = this.directories;

  return new UPNPServer(
    configuration.httpPort,
    configuration,
    _.bind(this.afterServerStart, this)
  );
};

/**
 * After server start.
 *
 * @param {string} error
 * @param {object} upnpServer
 */
API.prototype.afterServerStart = function (error, upnpServer) {
  this.logError(error);

  this.emit("starting");

  this.upnpServer = upnpServer;

  var descURL = this.upnpServer.descriptionPath.charAt(0) === "/" ?
    this.upnpServer.descriptionPath.substring(1) : this.upnpServer.descriptionPath,
    locationURL = 'http://' + ip.address() + ':' + this.configuration.httpPort + "/" + descURL,
    self = this;

  this.ssdpServer = new SSDP.Server({
    logLevel : self.configuration.ssdpLogLevel, // 'trace',
    log : self.configuration.ssdpLog,
    udn : self.upnpServer.uuid,
    description : descURL,
    location : locationURL
  });

  this.ssdpServer.addUSN('upnp:rootdevice');
  this.ssdpServer.addUSN(upnpServer.type);

  if (this.upnpServer.services) {
    this.upnpServer.services.forEach(_.bind(function (service) {
      this.ssdpServer.addUSN(service.type);
    }, this));
  }

  this.httpServer = http.createServer(_.bind(this.afterHttpServerCreate, this));

  this.httpServer.listen(upnpServer.port);

  this.ssdpServer.start();

  this.emit("waiting");
};

/**
 * After http server creation.
 *
 * @param {object} request
 * @param {object} response
 */
API.prototype.afterHttpServerCreate = function (request, response) {
  this.request = request;
  this.response = response;

  this.path = url.parse(this.request.url).pathname;

  logger.debug("Uri=" + this.request.url);

  try {
    this.upnpServer.processRequest(this.request, this.response, this.path, _.bind(this.afterProcessRequest, this));
    
  } catch (error) {
    logger.error("Process request exception", error);
    this.emit("error", error);
  }
};

/**
 * After processed request.
 *
 * @param {string} error
 * @param {boolean} processed
 */
API.prototype.afterProcessRequest = function (error, processed) {
  if (error) {
    this.response.writeHead(500, 'Server error: ' + error);
    this.response.end();

    this.emit("error:500", error);
    return;
  }

  if (!processed) {
    this.response.writeHead(404, 'Resource not found: ' + this.path);
    this.response.end();

    this.emit("error:404", this.path);

  }
};

/**
 * Stop server.
 *
 * @param {function|null} callback
 */
API.prototype.stop = function (callback) {
  callback = callback || function () { return false; };

  var httpServer = this.httpServer,
    ssdpServer = this.ssdpServer,
    stopped = false;

  if (this.ssdpServer) {
    this.ssdpServer = undefined;
    stopped = true;

    try {
      ssdpServer.stop();
    } catch (error) {
      this.logError(error);
    }
  }

  if (httpServer) {
    this.httpServer = undefined;
    stopped = true;

    try {
      httpServer.stop();
    } catch (error) {
      this.logError(error);
    }
  }

  if (stopped) {
    this.emit("stopped");
  }

  callback(null, stopped);
};

/**
 * Output error.
 *
 * @param {string} error
 */
API.prototype.logError = function (error) {
  if (error) {
    logger.error(error);
  }
};

module.exports = API;
