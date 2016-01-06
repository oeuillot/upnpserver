/*jslint node: true, nomen: true, esversion: 6 */
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
var DirectoryRepository = require('./lib/repositories/directoryRepository');
var MusicRepository = require('./lib/repositories/musicRepository');
var HistoryRepository = require('./lib/repositories/historyRepository');
var IceCastRepository = require('./lib/repositories/iceCastRepository');
var VideoRepository = require('./lib/repositories/videoRepository');

class API extends events.EventEmitter {

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
  constructor(configuration, paths) {
    super();
    
    this.configuration = _.extend(this.defaultConfiguration, configuration);
    this.directories = [];
    this._upnpClasses = {};
    this._contentHandlers = [];
    this._contentHandlersKey = 0;

    if (typeof (paths) === "string") {
      this.addDirectory("/", paths);

    } else if (util.isArray(paths)) {
      paths.forEach((path) => this.initPaths(path));
    }

    if (this.configuration.noDefaultConfig !== true) {
      this.loadConfiguration("./default-config.json");
    }

    var cf = this.configuration.configurationFiles;
    if (typeof (cf) === "string") {
      this.loadConfigurationFile(cf);

    } else if (util.isArray(cf)) {
      cf.forEach((c) => this.loadConfiguration(c));
    }
  }

  /**
   * Default server configuration.
   * 
   * @type {object}
   */
  get defaultConfiguration() {
    return {
      "dlnaSupport" : true,
      "httpPort" : 10293,
      "name" : "Node Server",
      "version" : require("./package.json").version
    };
  }

  /**
   * Initialize paths.
   * 
   * @param path
   */
  initPaths(path) {
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
          throw new Error("Path must be defined '" + util.inspect(path) + "'");
        }
        this.addMusicDirectory(mountPoint, path.path);
        break;

      case "video":
        if (!path.path) {
          throw new Error("Path must be defined '" + util.inspect(path) + "'");
        }
        this.addVideoDirectory(mountPoint, path.path);
        break;

      case "history":
        this.addHistoryDirectory(mountPoint);
        break;

      case "icecast":
        this.addIceCast(mountPoint);
        break;

      default:
        if (!path.path) {
          throw new Error("Path must be defined '" + util.inspect(path) + "'");
        }
      this.addDirectory(mountPoint, path.path);
      }
      return;
    }

    throw new Error("Invalid path '" + util.inspect(path) + "'");
  }

  /**
   * Add simple directory.
   * 
   * @param {string}
   *            mountPoint
   * @param {string}
   *            path
   */
  addDirectory(mountPoint, path) {
    assert(typeof (mountPoint) === "string", "Invalid mountPoint parameter '" +
        mountPoint + "'");

    if (typeof (path) === "object") {
      // TODO
    }

    assert(typeof (path) === "string", "Invalid path parameter '" + mountPoint +"'");

    var repository = new DirectoryRepository("path:" + path, mountPoint, path);

    this.addRepository(repository);
  }

  /**
   * Add a repository.
   * 
   * @param {Repository}
   *            repository
   */
  addRepository(repository) {
    assert(repository, "Invalid repository parameter '" + repository + "'");

    this.directories.push(repository);
  }

  /**
   * Add music directory.
   * 
   * @param {string}
   *            mountPoint
   * @param {string}
   *            path
   */
  addMusicDirectory(mountPoint, path) {
    assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
        mountPoint + "'");
    assert(typeof path === "string", "Invalid path parameter '" + mountPoint +
    "'");

    var repository = new MusicRepository("music:" + path, mountPoint, path);

    this.addRepository(repository);
  }

  /**
   * Add video directory.
   * 
   * @param {string}
   *            mountPoint
   * @param {string}
   *            path
   */
  addVideoDirectory(mountPoint, path) {
    assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
        mountPoint + "'");
    assert(typeof path === "string", "Invalid path parameter '" + mountPoint +
    "'");

    var repository = new VideoRepository("video:" + path, mountPoint, path);

    this.addRepository(repository);
  }

  /**
   * Add history directory.
   * 
   * @param {string}
   *            mountPoint
   */
  addHistoryDirectory(mountPoint) {
    assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
        mountPoint + "'");

    var repository = new HistoryRepository(null, mountPoint);

    this.addRepository(repository);
  }

  /**
   * Add iceCast.
   * 
   * @param {string}
   *            mountPoint
   * @param {object}
   *            medias (icecasts medias)
   */
  addIceCast(mountPoint) {
    assert(typeof mountPoint === "string", "Invalid mountPoint parameter '" +
        mountPoint + "'");

    var repository = new IceCastRepository("iceCast", mountPoint);

    this.addRepository(repository);
  }

  loadConfiguration(path) {
    var config = require(path);

    var upnpClasses = config.upnpClasses;
    if (upnpClasses) {
      for ( var upnpClassName in upnpClasses) {
        var p = upnpClasses[upnpClassName];

        var clazz = require(p);

        this._upnpClasses[upnpClassName] = new clazz();
      }
    }

    var contentHandlers = config.contentHandlers;
    if (contentHandlers) {
      var cs = this._contentHandlers;

      contentHandlers.forEach((contentHandler) => {

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

        this.addDirectory(mountPoint, directory);
      }
    }
  }

  /**
   * Start server.
   */
  start() {
    this.stop(() => {
      this.startServer();
    });
  }

  /**
   * Start server callback.
   * 
   * @return {UPNPServer}
   */
  startServer(callback) {

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
  }

  /**
   * After server start.
   * 
   * @param {object}
   *            upnpServer
   */
  _upnpServerStarted(upnpServer, callback) {

    this.emit("starting");

    this.upnpServer = upnpServer;

    var locationURL = 'http://' + ip.address() + ':' +
    this.configuration.httpPort + "/description.xml";

    if (this.configuration.ssdpLog && !this.configuration.ssdpLogLevel) {
      this.configuration.ssdpLogLevel = "debug";
    }

    var ssdpServer = new SSDP.Server({
      logLevel : this.configuration.ssdpLogLevel, // 'trace',
      log : this.configuration.ssdpLog,
      udn : this.upnpServer.uuid,
      description : "/description.xml",
      location : locationURL,
      ssdpSig : "Node/" + process.versions.node + " UPnP/1.0 " + "UPnPServer/" +
      require("./package.json").version
    });
    this.ssdpServer = ssdpServer;

    ssdpServer.addUSN('upnp:rootdevice');
    ssdpServer.addUSN(upnpServer.type);

    var services = upnpServer.services;
    if (services) {
      for ( var route in services) {
        ssdpServer.addUSN(services[route].type);
      }
    }

    var httpServer = http.createServer();
    this.httpServer = httpServer;

    httpServer.on('request', this._processRequest.bind(this));

    httpServer.listen(upnpServer.port, (error) => {
      if (error) {
        return callback(error);
      }

      this.ssdpServer.start();

      this.emit("waiting");

      var address = httpServer.address();

      var hostname = address.address;
      if (address.family === 'IPv6') {
        hostname = '[' + hostname + ']';
      }

      console.log('Ready http://' + hostname + ':' + address.port);

      callback();
    });
  }

  /**
   * Process request
   * 
   * @param {object}
   *            request
   * @param {object}
   *            response
   */
  _processRequest(request, response) {

    var path = url.parse(request.url).pathname;

    // logger.debug("Uri=" + request.url);

    var now = Date.now();
    try {
      this.upnpServer.processRequest(request, response, path, (error, processed) => {

        var stats = {
            request : request,
            response : response,
            path : path,
            processTime : Date.now() - now,
        };

        if (error) {
          response.writeHead(500, 'Server error: ' + error);
          response.end();

          this.emit("code:500", error, stats);
          return;
        }

        if (!processed) {
          response.writeHead(404, 'Resource not found: ' + path);
          response.end();

          this.emit("code:404", stats);
          return;
        }

        this.emit("code:200", stats);
      });

    } catch (error) {
      logger.error("Process request exception", error);
      this.emit("error", error);
    }
  }

  /**
   * Stop server.
   * 
   * @param {function|null}
   *            callback
   */
  stop(callback) {
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
  }
}

module.exports = API;
