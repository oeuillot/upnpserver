/*jslint node: true, vars: true, nomen: true */
"use strict";

var Async = require("async");
var events = require('events');
var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var Path = require('path');
var send = require('send');
var util = require('util');
var url = require('url');
var _ = require('underscore');
var os = require('os');
var net = require('net');
var http = require('http');
var debugFactory = require('debug');
var debug = debugFactory('RootDevice:server');
var debugProfiling = debugFactory('RootDevice:profiling');

var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;

var DEFAULT_LANGUAGE = "en";

var RootDevice = function( api, _configuration, callback) {

  var self = this;
  var configuration = _.clone(_configuration || {});

  this.ssdp          = api.ssdp;

  this.configuration = configuration;

  this.subDevices = {};

  // sub devices (main and embed ones)
  this.rootDevice = null;
  this.embedDevices = [];


  var lang = configuration.lang || process.env.LANG || DEFAULT_LANGUAGE;

  var langPart = /^([a-z][a-z]).*$/i.exec(lang);
  try {
    configuration.i18n = require("./i18n/" + langPart[1].toLowerCase());

  } catch (e) {
    // if localization is not supported, trying to use english by default
    configuration.i18n = require("./i18n/" + DEFAULT_LANGUAGE);
  }

  this.dlnaSupport = !!configuration.dlna;

  this.packageDescription = require("../package.json");

  this.startHttpServer(function(){

    var addmethod = 'addRoot';

    Async.forEachOfSeries(self.subDevices, function(sub, key, callback){

      logger.info("Add subDevice %s", key);

      var subroute = "";
      if (addmethod !== 'addRoot'){
          subroute = "/" + sub.route;
      }

      var location = ':' + self.port + subroute + '/description.xml';

      self.ssdp[addmethod](sub.uuid, sub.type, location, sub.ssdpHeadersCallback);

      addmethod = 'addDevice';

      sub.addServices(callback);


    },function(err){

      callback(err, self);

    });
  });
};
module.exports = RootDevice;

util.inherits(RootDevice, events.EventEmitter);


RootDevice.prototype.createSubDevices = function(config, callback) {

  var self = this;


  Async.forEachOfSeries(config, function(configuration, deviceRoute, callback){

    var deviceClass = require("./" + deviceRoute);

    self.emit("device", deviceRoute);

    new deviceClass(self, deviceRoute, configuration, function(error, instance) {
        if (error) {
          logger.error(error);
        }
        // Embed devices list
        if (!self.rootDevice){
          self.rootDevice = instance;
        } else {
          self.embedDevices.push(instance);
        }

        self.subDevices[deviceRoute] = instance;

        return callback(error);
      });



  }, function(error){

    if (error) return callback(error);
    callback(null);

  });

}
RootDevice.prototype.startHttpServer = function(callback){

  var self = this;
  this.findPort(this.configuration.httpPort || 8080 ,function(port){

    var server = http.createServer();

    self.port = port;
    self.server = server;

    self.emit("waiting");

    server
      .on('request', self.requestHandler.bind(self))
      .on('error', function(err){console.log(err)})
      .on('listening', function(err){

        var address = server.address();
        var hostname = address.address;
        if (address.family === 'IPv6') {
          hostname = '[' + hostname + ']';
        }

        console.log('Add rootDevice http://' + hostname + ':' + address.port);
        self.createSubDevices(self.configuration.devices, callback);

      })
      .listen(self.port);


  });

}

/**
 * Find first free port >= port
 *
 * @param {integer}
 *            port
 * @param {function}
 *            callback(available_port)
 */
RootDevice.prototype.findPort = function(port, callback){
  var self = this;
  var server = net.createServer();
  server.listen(port, function (err) {
    server.once('close', function () {
      callback(port);
    })
    server.close();
  })
  server.on('error', function (err) {
    self.findPort(port+1, callback);
  })
}


/**
 * Handle request
 *
 * @param {object}
 *            request
 * @param {object}
 *            response
 */
RootDevice.prototype.requestHandler = function(request, response) {

  var path = url.parse(request.url).pathname;

  // logger.debug("Uri=" + request.url);

  var now = Date.now();
  var self = this;
  try {
    this.processRequest(request, response, path, function(error,
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
 * Process request
 *
 * @param {object}
 *            request
 * @param {object}
 *            response
 * @param {string}
 *            path
 * @param {function|null}
 *            callback
 */
RootDevice.prototype.processRequest = function(request, response, path,
    callback) {
  var self = this;
  var now;
  if (debugProfiling.enabled) {
    now = Date.now();
  }

  var localhost = request.socket.localAddress;
    if (localhost === '::1') {
      // We transform IPv6 local host to IPv4 local host
      localhost = "127.0.0.1";

    } else {
      var ip6 = /::ffff:(.*)+/.exec(localhost);
      if (ip6) {
        localhost = ip6[1];

        // Transform IPv6 IP address to IPv4
      }
    }

  request.myHostname = localhost;

  response.sendDate = true;

  // Replace any // by /, split and remove first empty segment
  var route = path.replace(/\/\//g, "/").split("/");
  route.shift();
  var segment = route.shift()
  ,   action  = route.join("/")
  ;

  logger.debug("Request='" + path + "' from='" +
      request.connection.remoteAddress + "' port'" + this.port + "' segment:" + segment +" action:"+action);
  // Handle description.xml
  // build deviceList for embed devices

  switch (segment){
    // description of root device
    case "description.xml":{

      return this.rootDevice.toJXML("/" + this.rootDevice.route, request, function(error, xmlObject) {
        if (error) {
          return callback(error);
        }

        var deviceList = [];

        self.embedDevices.forEach(function(device){
          device.toJXML.call(device, "/" + device.route, request, function(error, xml){
            deviceList.push({"device":xml._content.device});
          });
        });
        if (deviceList.length){
          xmlObject._content.device["deviceList"] = deviceList;
        }

        var xml = jstoxml.toXML(xmlObject, {
          header : true,
          indent : " ",
          filter : xmlFilters
        });

        if (debug.enabled) {
          debug("Descript Path request: returns: " + xml);
        }

        // logger.verbose("Request description path: " + xml);
        response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");

        response.end(xml, "UTF-8");
        return callback(null, true);
      });

    }
    break;
    default:{
      if (this.subDevices[segment]){
        return this.subDevices[segment].processRequest(request, response, action, function(error, found) {
          if (error) {
            return callback(error);
          }
          if (debugProfiling.enabled) {
            debugProfiling("Profiling " + (Date.now() - now) + "ms");
          }
          callback(null, true);
        });
      }

    }
  }
  callback(null, false);
};
