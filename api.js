/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const events = require('events');
const http = require('http');
const ip = require('ip');
const SSDP = require('node-ssdp');
const url = require('url');
const util = require('util');

const debug = require('debug')('upnpserver:api');
const logger = require('./lib/logger');

const UPNPServer = require('./lib/upnpServer');
const Repository = require('./lib/repositories/repository');

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
    
    this.configuration = Object.assign({}, this.defaultConfiguration, configuration);
    this.repositories = [];
    this._upnpClasses = {};
    this._contentHandlers = [];
    this._contentProviders = {};
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
      var toks=cf.split(',');
      toks.forEach((tok) => this.loadConfiguration(tok));

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
   * @param {string|object} path
   * @returns {Repository} the created repository
   */
  initPaths(path) {
    if (typeof (path) === "string") {
      return this.addDirectory("/", path);
    }
    if (typeof(path)==="object") {
      if (path.type==="video") {
        path.type="movie";
      }
      
      return this.declareRepository(path);
    }    

    throw new Error("Invalid path '" + util.inspect(path) + "'");  
  }
  
  /**
   * Declare a repository
   * 
   *  @param {object} the configuration
   *  @returns {Repository} the new repository
   */
  declareRepository(configuration) {
    var config=Object.assign({}, configuration);
    
    var mountPath = config.mountPoint || config.mountPath || "/";

    var type = config.type && config.type.toLowerCase();
    if (!type) {
      logger.error("Type is not specified, assume it is a 'directory' type");
      type = "directory";
    }
    
    var requirePath=configuration.require;
    if (!requirePath) {
      requirePath="./lib/repositories/"+type;
    }

    debug("declareRepository", "requirePath=",requirePath,"mountPath=",mountPath,"config=",config);
      
    var clazz = require(requirePath);
    if (!clazz) {
      logger.error("Class of repository must be specified");
      return;
    }
    
    var repository = new clazz(mountPath, config);
    
    return this.addRepository(repository);
  }

  /**
   * Add a repository.
   * 
   * @param {Repository}
   *            repository
   *            
   * @returns {Repository} a Repository object
   */
  addRepository(repository) {
    assert(repository instanceof Repository, "Invalid repository parameter '" + repository + "'");

    this.repositories.push(repository);
    
    return repository;
  }

  /**
   * Add simple directory.
   * 
   * @param {string}
   *            mountPath
   * @param {string}
   *            path
   *            
   * @returns {Repository} a Repository object
   */
  addDirectory(mountPath, path, configuration) {
    assert.equal(typeof (mountPath), "string", "Invalid mountPoint parameter '" +
        mountPath + "'");

    assert.equal(typeof (path), "string", "Invalid path parameter '" + path +"'");

    configuration=Object.assign({}, configuration, { mountPath, path, type: "directory"});

    return this.declareRepository(configuration);
  }

  /**
   * Add music directory.
   * 
   * @param {string}
   *            mountPath
   * @param {string}
   *            path
   *            
   * @returns {Repository} a Repository object
   */
  addMusicDirectory(mountPath, path, configuration) {
    assert.equal(typeof mountPoint, "string", "Invalid mountPoint parameter '" +
        mountPath + "'");
    assert.equal(typeof path, "string", "Invalid path parameter '" + mountPath + "'");

    configuration=Object.assign({}, configuration, { mountPath, path, type: "music"});

    return this.declareRepository(configuration);
  }

  /**
   * Add video directory.
   * 
   * @param {string}
   *            mountPath
   * @param {string}
   *            path
   *            
   * @returns {Repository} a Repository object
   */
  addVideoDirectory(mountPath, path, configuration) {
    assert.equal(typeof mountPath, "string", "Invalid mountPoint parameter '" + mountPath + "'");
    assert.equal(typeof path, "string", "Invalid path parameter '" + path + "'");

    configuration=Object.assign({}, configuration, { mountPath, path, type: "movie"});

    return this.declareRepository(configuration);
  }

  /**
   * Add history directory.
   * 
   * @param {string}
   *            mountPath
   *            
   * @returns {Repository} a Repository object
   */
  addHistoryDirectory(mountPath, configuration) {
    assert.equal(typeof mountPath, "string", "Invalid mountPoint parameter '" + mountPath + "'");

    configuration=Object.assign({}, configuration, { mountPath, type: "history"});

    return this.declareRepository(configuration);
  }

  /**
   * Add iceCast.
   * 
   * @param {string}
   *            mountPath
   * @param {object}
   *            configuration 
   *            
   * @returns {Repository} a Repository object
   */
  addIceCast(mountPath, configuration) {
    assert.equal(typeof mountPath, "string", "Invalid mountPoint parameter '" +
        mountPath + "'");

    configuration=Object.assign({}, configuration, { mountPath, type: "iceCast"});

    return this.declareRepository(configuration);
  }

  /**
   * 
   */
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
    if (contentHandlers instanceof Array) {
      contentHandlers.forEach((contentHandler) => {

        var mimeTypes = contentHandler.mimeTypes || [];

        if (contentHandler.mimeType) {
          mimeTypes = mimeTypes.slice(0);
          mimeTypes.push(contentHandler.mimeType);
        }
        
        var requirePath=contentHandler.require;
        if (!requirePath) {
          requirePath="./lib/contentHandlers/"+contentHandler.type;
        }
        if (!requirePath) {
          logger.error("Require path is not defined !");
          return;
        }

        var clazz = require(requirePath);
        if (!clazz) {
          logger.error("Class of contentHandler must be specified");
          return;
        }

        var configuration = contentHandler.configuration || {};

        var ch = new clazz(configuration, mimeTypes);
        ch.priority = contentHandler.priority || 0;
        ch.mimeTypes = mimeTypes;

        this._contentHandlers.push(ch);
      });
    }

    var contentProviders = config.contentProviders;
    if (contentProviders instanceof Array) {
      contentProviders.forEach((contentProvider) => {
        var protocol = contentProvider.protocol;
        if (!protocol) {
          logger.error("Protocol property must be defined for contentProvider "+contentProvider.id+"'.");
          return;
        }
        if (protocol in this._contentProviders) {
          logger.error("Protocol '"+protocol+"' is already known");
          return;
        }

        var name=contentProvider.name || protocol;

        var requirePath=contentProvider.require;
        if (!requirePath) {
          var type=contentProvider.type || protocol;
          
          requirePath="./lib/contentProviders/"+type;
        }
        if (!requirePath) {
          logger.error("Require path is not defined !");
          return;
        }

        var clazz = require(requirePath);
        if (!clazz) {
          logger.error("Class of contentHandler must be specified");
          return;
        }

        var configuration = Object.assign({}, contentProvider);

        var ch = new clazz(configuration, protocol);
        ch.protocol = protocol;
        ch.name=name;

        this._contentProviders[protocol]=ch;
      });
    }

    var repositories = config.repositories;
    if (repositories) {
      repositories.forEach((configuration) => this.declareRepository(configuration));
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
    callback=callback || () => {};
    debug("startServer", "Start the server");

    if (!this.repositories.length) {
      return callback(new Error("No directories defined !"));
    }

    var configuration = this.configuration;
    configuration.repositories = this.repositories;
    configuration.upnpClasses = this._upnpClasses;
    configuration.contentHandlers = this._contentHandlers;
    configuration.contentProviders = this._contentProviders;

    if (!callback) {
      callback = (error) => {
        if (error) {
          logger.error(error);
        }
      };
    }

    var upnpServer = new UPNPServer(configuration.httpPort, configuration, (error, upnpServer) => {
      if (error) {
        logger.error("Can not start UPNPServer", error);

        return callback(error);
      }

      debug("startServer", "Server started ...");

      this._upnpServerStarted(upnpServer, callback);
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

    var locationURL = 'http://' + ip.address() + ':' + this.configuration.httpPort + "/description.xml";
    
    var config={
        udn : this.upnpServer.uuid,
        description : "/description.xml",
        location : locationURL,
        ssdpSig : "Node/" + process.versions.node + " UPnP/1.0 " + "UPnPServer/" +
        require("./package.json").version
      };
    
    debug("_upnpServerStarted", "New SSDP server config=",config);

    var ssdpServer = new SSDP.Server(config);
    this.ssdpServer = ssdpServer;

    ssdpServer.addUSN('upnp:rootdevice');
    ssdpServer.addUSN(upnpServer.type);

    var services = upnpServer.services;
    if (services) {
      for ( var route in services) {
        ssdpServer.addUSN(services[route].type);
      }
    }

    debug("_upnpServerStarted", "New Http server port=",upnpServer.port);
    
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

      debug("_upnpServerStarted", "Http server is listening on address=",address);

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
    callback = callback || () => {
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
