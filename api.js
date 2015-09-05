/*jslint node: true, nomen: true */
"use strict";

var assert = require('assert');
var events = require('events');
var os = require('os');
var Async=require('async');
//var SSDP = require('node-ssdp');
var SsdpServer = require('./lib/ssdp');
var debug = require('debug')('api:ssdp');
var url = require('url');
var util = require('util');
var _ = require('underscore');

var logger = require('./lib/logger');


/**
 * Default server configuration.
 *
 * @type {object}
 */
var defaultConfiguration = {
  "ssdp":{
    "LogLevel":"ERROR",
    "Log":1,
    "ssdpTtl": 4,
    "ttl": 900,
    "adInterval": 450000
  }
  /*
  ,
  "devices":{
    "MediaServer":{
      "dlnaSupport" : true,
      "name" : "Node Server",
      "version" : require("./package.json").version,
      "ensableIntelToolkitSupport":false,
      "services":{
        "ConnectionManager":"",
        "MediaRecieverRegistar":"",
        "ContentDirectory":{
          "paths":[
            { path: '/Users/stephen/Documents', mountPoint: '/Documents' }
          , { mountPoint:'/IceCast', type:'icecast'}
          //, { mountPoint: '/Audio', type:'music', path:'/Users/stephen/Music'}
          //, { mountPoint: '/Video', type:'path', path:'/Users/stephen/Movies'}
          //, { mountPoint: '/Images', type:'path', path:'/Users/stephen/Pictures'}
          ]
        }
      }
    }
  }
  */
};

/**
 * MediaServer API.
 *
 * @param {object}
 *            configuration
 * @param {array}
 *            paths
 *
 * @constructor
 */
var API = function(configuration) {
  var self = this;

  this.configuration = _.extend(defaultConfiguration, configuration);

  this.devices = {};

  this.ips = this.configuration.ips ||
      this.getExternalIps(this.configuration.ipFamily, this.configuration.iface);

  this.ssdpServers = {};

  this.ips.forEach(function(host){
    self.ssdpServers[host] = new SsdpServer({
      unicastHost: host,
      logLevel : self.configuration.ssdp.LogLevel,
      log : self.configuration.ssdp.Log || 0,
      ssdpSig: "Node/" + process.versions.node + " UPnP/1.0 " +
          "UPnPServer/" + require("./package.json").version
    });
  });


  var config = [];
  /*
  // config from files
  var cf = this.configuration.configurationFiles;
  if (typeof (cf) === "string") {
    var conf = require(cf);
    config.push(conf.devices);
  }

  if (this.configuration.noDefaultConfig === false) {
    var conf = require("./default-config.json");
    config.push(conf.devices);
  }
  */
  // config from API arguments
  if (this.configuration.devices){
    config.push(this.configuration.devices);
  }

  // console.log("config:" + util.inspect(config, {depth:3}) + "end");

  Async.eachSeries(config, function(devices, callback){

    self.createDevices(devices, callback);
  },
  function(error){
    if (error) return console.log(error);
    self._StartSsdp();
  });

};

util.inherits(API, events.EventEmitter);

/**
 * Default server configuration.
 *
 * @type {object}
 */
API.prototype.defaultConfiguration = {
  "ssdp":{
    "LogLevel":"ERROR",
    "Log":1,
    "ssdpTtl": 4,
    "ttl": 900,
    "adInterval": 450000
  }
  /*
  ,
  "devices":{
    "MediaServer":{
      "dlnaSupport" : true,
      "name" : "Node Server",
      "version" : require("./package.json").version,
      "ensableIntelToolkitSupport":false,
      "services":{
        "ConnectionManager":"",
        "MediaRecieverRegistar":"",
        "ContentDirectory":{
          "paths":[
            { path: '/Users/stephen/Documents', mountPoint: '/Documents' }
          , { mountPoint:'/IceCast', type:'icecast'}
          //, { mountPoint: '/Audio', type:'music', path:'/Users/stephen/Music'}
          //, { mountPoint: '/Video', type:'path', path:'/Users/stephen/Movies'}
          //, { mountPoint: '/Images', type:'path', path:'/Users/stephen/Pictures'}
          ]
        }
      }
    }
  }
  */
};


API.prototype.createDevices = function(config, callback) {

  var self = this;

  Async.forEachOfSeries(config, function(configuration, name, callback){

    var deviceClass = require("./lib/" + name);

    logger.info("Add device %s", name);

    self.emit("device", name);

    new deviceClass(self, configuration, function(error, instance) {
        if (error) {
          logger.error(error);
        }
        self.devices[name] = instance;
        return callback(error);
      });

  }, function(error){

    if (error) return callback(error);
    callback(null);

  });

}

/**
 * Start server.
 */
API.prototype.start = function(path) {
  var self = this;
  this.stop(function() {
    self._StartSsdp(path);
  });
};


/**
 * After server start.
 *
 * @param {function}
 *            callback
 */
API.prototype._StartSsdp = function(callback) {
  var self = this;
  this.ips.forEach(function(host){
    self.ssdpServers[host].start();
  });

  this.emit("ready");
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

  // TODO: stop http servers
  Async.forEachOf(this.devices, function (device, name, callback){


  });

  if (stopped) {
    this.emit("stopped");
  }

  callback(null, stopped);
};

/**
 * Get all available external ips.
 *
 * @param {string|null}
 *            ipFamily in [IPv4|IPv6] default : IPv4, use all if null
 *
 * @param {string|null}
 *            iface : network interface name
 */
API.prototype.getExternalIps = function (ipFamily, iface) {

    var self = this
    ,   ifaces = os.networkInterfaces()
    ,   family = ipFamily !== undefined ? ipFamily : "IPv4"
    ,   ips    = []
    ;

    for (var dev in ifaces) {
        var devs = ifaces[dev]
        if (iface && dev != iface) {
          continue
        }
        for (var di in devs) {
            var ni = devs[di]

            if (family && ni.family != family) {
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

            ips.push( ni.address );
            console.log("API found "+ni.address);
        }
    }
    // logger.error("Unable to find an external ip adress, use 127.0.0.1");
    return ips.length && ips || ['127.0.0.1'];
}


module.exports = API;
