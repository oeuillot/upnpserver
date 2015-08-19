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
    logLevel : this.configuration.ssdp.LogLevel,
    log : this.configuration.ssdp.Log,
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
  "dms":{
    "dlnaSupport" : true,
    "httpPort" : 10293,
    "name" : "Node Server",
    "version" : require("./package.json").version
  }
};



API.prototype.loadConfiguration = function(path) {
  var config = require(path);

  var self = this;

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


  var configuration = this.configuration.dms;

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
