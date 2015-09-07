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
var debug = debugFactory('SubDevice:server');
var debugProfiling = debugFactory('SubDevice:profiling');

var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;

var DEFAULT_LANGUAGE = "en";

var SubDevice = function(type, rootdevice, route, _configuration, callback) {

  var configuration = _.clone(_configuration || {});

  this.root    = rootdevice;
  this.embedDevices = [];
  this.version = configuration.version || 1;
  this.type    = type + ":" + this.version;
  this.name    = configuration.name || "Node UPNP "+ route;
  this.route   = route;
  this.configuration = configuration;

  this.configuration.i18n = this.root.configuration.i18n;

  this.dlnaSupport = !!configuration.dlna;

  this.uuid = configuration.uuid || Uuid.v4();
  if (this.uuid.indexOf("uuid:") !== 0) {
    this.uuid = "uuid:" + this.uuid;
  }

  this.serverName = configuration.serverName;

  if (!this.serverName) {
    var ns = [ "Node/" + process.versions.node, "UPnP/1.0",
        this.route + "/" + this.root.packageDescription.version ];

    if (this.dlnaSupport) {
      ns.push("DLNADOC/1.50");
    }

    this.serverName = ns.join(" ");
  }

  this.services = {};

  callback();

};
module.exports = SubDevice;

util.inherits(SubDevice, events.EventEmitter);

SubDevice.UPNP_DEVICE_XMLNS  = "urn:schemas-upnp-org:device-1-0";
SubDevice.DLNA_DEVICE_XMLNS  = "urn:schemas-dlna-org:device-1-0";

/**
 * Require service file, instanciate passing configuration
 *
 * @param {object}
 *        configuration
 * @param {string}
 *        name : service file name prefix without "Service"
 * @param {function}
 *        callback : callback passing created instance
 */
SubDevice.prototype.makeServiceInstance = function(configuration, classPrefix, callback){

  var serviceClass = require("./" + classPrefix + "Service");

  var instance     = new serviceClass(this, classPrefix, configuration);

  try{
    instance.ErrorSoap = require('./util/' + classPrefix + 'ErrorSoap');
  } catch(e){
    instance.ErrorSoap = require('./util/errorSoap');
  }

  callback(instance);
}

/**
 *  Add service instance to device on the fly
 * @param {service}
 *        service : instance of the service to clone
 * @param {function}
 *        callback : callback passing error and instance
 */
SubDevice.prototype.addServiceInstance = function(service, callback){
  var self = this;
  // find first free service instanceID
  var InstanceID = 0;
  var found      = true;
  while (found){
    InstanceID ++;
    found = self.services[service.route + "_id_" + InstanceID] !== undefined;
  }
  var configuration = _.clone(service.configuration || {});
  configuration.InstanceID = InstanceID;
  self.makeServiceInstance(configuration, service.classPrefix, function(instance){
    self.addService(instance, callback, false);
  }.bind(self));
}

/**
 * Remove service instance to device on the fly
 * @param {service}
 *        instance : service to remove
 */
SubDevice.prototype.removeServiceInstance = function(instance){
  delete this.services[instance.route];
}

SubDevice.prototype.addServices = function(callback){

  var self = this;

  if (!self.configuration.services) {
      return callback(new Error("SubDevice without services found"));
  }

  Async.forEachOf(self.configuration.services, function(configuration, classPrefix, callback) {

    logger.info("Add service: %s", classPrefix);
    // self.api.emit("service", name);
    self.makeServiceInstance(configuration, classPrefix, function(instance){

      self.addService(instance, callback, true);

    });

  }, function(error) {
    if (error) {
      return callback(error, self);
    }

    return callback(null, self);
  });
}

SubDevice.prototype.addService = function(service, callback, advertise) {
  var self = this;
  service.initialize( function(error) {
    if (error) {
      return callback(error);
    }

    self.services[service.route] = service;

    // allow devices to add services instances
    // without advertising
    if (advertise !== false){

      self.root.ssdp.addService( self.uuid, service.type);

    }

    self.emit("newService", service);

    callback(null, service);
  });

};

SubDevice.prototype.toJXML = function(addroute, request, callback) {

  var segment = addroute ? "/" + this.route : "";

  var serviceList = [];
  for (var route in this.services) {

    // prevent multiple service instances
    // to show in description
    if (route.indexOf("_id_") > -1) continue;

    this.services[route].pushServiceJXml(segment, serviceList);
  };



  var xml = {
    _name : "root",
    _attrs : {
      xmlns : SubDevice.UPNP_DEVICE_XMLNS
      },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      device : {
        deviceType : this.type,
        friendlyName : this.name,
        manufacturer : this.root.packageDescription.author,
        manufacturerURL : "https://github.com/oeuillot/upnpserver",
        modelDescription : "Node upnp server",
        modelName : "Windows Media Connect compatible (Node upnpserver)",
        modelURL : "https://github.com/oeuillot/upnpserver",
        modelNumber : this.root.packageDescription.version,
        serialNumber : "1.2",

        UDN : this.uuid,
        // must be relative to description path /
        presentationURL : segment + "/index.html",

        iconList : [ {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 32,
            height : 32,
            depth : 24,
            url : segment + "/icons/icon_32.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 128,
            height : 128,
            depth : 24,
            url : segment + "/icons/icon_128.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 512,
            height : 512,
            depth : 24,
            url : segment + "/icons/icon_512.png"
          }
        } ],

        serviceList : serviceList
      }
    }
  };

  if (this.root.dlnaSupport) {
    xml._attrs["xmlns:dlna"] = SubDevice.DLNA_DEVICE_XMLNS;
    xml._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
  }

  return callback(null, xml);
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
SubDevice.prototype.processRequest = function(request, response, path,
    callback) {

  response.setHeader("Server", this.serverName);

  // Replace any // by /, split
  var route   = path.split("/");
  var segment = route.shift()
  ,   action  = route.join("/")
  ;

  switch (segment){
    case "":
    case "index.html":{
      response.writeHead(200, {
        'Content-Type' : 'text/html'
      });
      var body = "<html><head><title>" + this.name + "</title></head><body><h1>" +
          this.name + "</h1></body></html>";
      return response.end(body, "utf-8", function(error, res) {
        if (error) {
          console.error(error);
        }
      });

    }
    break;
    case "description.xml":{

      return this.toJXML(false, request, function(error, xmlObject) {
        if (error) {
          return callback(error);
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
    case "icons":{
      var path = action.replace(/\.\./g, "").replace(/\\/g, "").replace(/\//g, "");

      var dir = __dirname;
      dir = dir.substring(0, dir.lastIndexOf(Path.sep));

      path = dir + ("/icon/" + path).replace(/\//g, Path.sep);

      if (debug.enabled) {
        debug("Send icon '" + path + "'");
      }

      send(request, path).pipe(response);
      return callback(null, true);
    }
    break;
  }

  if (this.dlnaSupport) {
    // Thanks to smolleyes for theses lines
    response.setHeader('transferMode.dlna.org', 'Streaming');
    response
        .setHeader('contentFeatures.dlna.org',
            'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');
  }

  if (this.services[segment]){
      return this.services[segment].processRequest(request, response, action, function(error, found) {
        if (error) {
          return callback(error);
        }

        callback(null, found);
      });
  }
  callback(null, false);

};
