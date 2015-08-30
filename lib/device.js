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
var debug = debugFactory('Device:server');
var debugProfiling = debugFactory('Device:profiling');

var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;

var DEFAULT_LANGUAGE = "en";

var Device = function(type, api, _configuration, callback) {

  var configuration = _.clone(_configuration || {});

  this.version = configuration.version || 1;
  this.type = type + ":" + this.version;
  this.ssdp = api.ssdpServer;
  this.ip   = api.ip;

  this.configuration = configuration;

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

  this.name = configuration.name || "Node UPNP Server";
  this.uuid = configuration.uuid || Uuid.v4();
  if (this.uuid.indexOf("uuid:") !== 0) {
    this.uuid = "uuid:" + this.uuid;
  }

  this.serverName = configuration.serverName;

  if (!this.serverName) {
    var ns = [ "Node/" + process.versions.node, "UPnP/1.0",
        "Device/" + this.packageDescription.version ];

    if (this.dlnaSupport) {
      ns.push("DLNADOC/1.50");
    }

    this.serverName = ns.join(" ");
  }

  this.services = {};

  this.startHttpServer(callback);

};
module.exports = Device;

util.inherits(Device, events.EventEmitter);

Device.UPNP_DEVICE_XMLNS  = "urn:schemas-upnp-org:device-1-0";
Device.DLNA_DEVICE_XMLNS  = "urn:schemas-dlna-org:device-1-0";

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
Device.prototype.makeServiceInstance = function(configuration, name, callback){
  var serviceClass = require("./" + name + "Service");
  var instance     = new serviceClass(configuration);
  // store class Prefix to require new instances on the fly
  instance.classPrefix = name;
  callback(instance);
}

/**
 *  Add service instance to device on the fly
 * @param {service}
 *        service : instance of the service to clone
 * @param {function}
 *        callback : callback passing error and instance
 */
Device.prototype.addServiceInstance = function(service, callback){
  var self = this;
  // find first free service instanceID
  var InstanceID = 0;
  var found      = true;
  while (found){
    InstanceID ++;
    found = self.services[service.route + "_" + InstanceID] !== undefined;
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
Device.prototype.removeServiceInstance = function(instance){
  delete this.services[instance.route];
}

Device.prototype.addServices = function(callback){

  var self = this;

  if (!self.configuration.services) {
      return callback(new Error("Device without services found"));
  }

  Async.forEachOf(self.configuration.services, function(configuration, name, callback) {

    logger.info("Add service: %s", name);

    self.makeServiceInstance(configuration, name, function(instance){

      self.addService(instance, callback, true);

    }.bind(self));

  }, function(error) {
    if (error) {
      return callback(error, self);
    }

    return callback(null, self);
  });
}

Device.prototype.startHttpServer = function(callback){

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

        console.log('Ready http://' + hostname + ':' + address.port);

        var location = 'http://' + self.ip + ':' + self.port + '/description.xml';

        self.ssdp.addDevice(self.uuid, self.type, location);

        callback(err);
      })
      .listen(self.port);


  });

}

Device.prototype.addService = function(service, callback, advertise) {
  var self = this;
  service.initialize(this, function(error) {
    if (error) {
      return callback(error);
    }

    self.services[service.route] = service;

    // allow devices to add services instances
    // without advertising
    if (advertise !== false){
      self.ssdp.addService(self.uuid, service.type);
    }

    self.emit("newService", service);

    callback(null, service);
  });

};

Device.prototype.toJXML = function(request, callback) {

  var serviceList = [];
  for (var route in this.services) {

    // prevent multiple service instances
    // to show in description
    if (route.indexOf("_") > -1) continue;

    serviceList.push(this.services[route].serviceToJXml());
  };
  var xml = {
    _name : "root",
    _attrs : {
      xmlns : Device.UPNP_DEVICE_XMLNS,
      // attempt to make windows media player to "recognise this device"
      "xmlns:pnpx":"http://schemas.microsoft.com/windows/pnpx/2005/11",
      "xmlns:df":"http://schemas.microsoft.com/windows/2008/09/devicefoundation"
    },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      device : {
        deviceType : this.type,
        friendlyName : this.name,
        manufacturer : this.packageDescription.author,
        manufacturerURL : "https://github.com/oeuillot/Device",
        modelDescription : "Node upnp server",
        modelName : "Windows Media Connect compatible (Node Device)",
        modelURL : "https://github.com/oeuillot/Device",
        modelNumber : this.packageDescription.version,
        serialNumber : "1.2",
        // attempt to make windows media player to "recognise this device"
        "pnpx:X_deviceCategory":"MediaDevices",
        "df:X_deviceCategory":"Multimedia",
        UDN : this.uuid,
        presentationURL : "http://" + this.ip + ":" + this.port + "/index.html",

        iconList : [ {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 32,
            height : 32,
            depth : 24,
            url : "/icons/icon_32.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 128,
            height : 128,
            depth : 24,
            url : "/icons/icon_128.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 512,
            height : 512,
            depth : 24,
            url : "/icons/icon_512.png"
          }
        } ],

        serviceList : serviceList
      }
    }
  };

  if (this.dlnaSupport) {
    xml._attrs["xmlns:dlna"] = Device.DLNA_DEVICE_XMLNS;
    xml._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
  }

  return callback(null, xml);
};


/**
 * Find first free port >= port
 *
 * @param {integer}
 *            port
 * @param {function}
 *            callback(available_port)
 */
Device.prototype.findPort = function(port, callback){
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
Device.prototype.requestHandler = function(request, response) {

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
Device.prototype.processRequest = function(request, response, path,
    callback) {

  var now;
  if (debugProfiling.enabled) {
    now = Date.now();
  }

  request.myHostname = this.ip;

  response.setHeader("Server", this.serverName);

  response.sendDate = true;

  // Replace any // by /, split and remove first empty segment
  var route = path.replace(/\/\//g, "/").split("/");
  route.shift();
  var segment = route.shift()
  ,   action  = route.join("/")
  ;

  logger.debug("Request='" + path + "' from='" +
      request.connection.remoteAddress + "' segment:" + segment +" action:"+action);

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
      return this.toJXML(request, function(error, xmlObject) {
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
        if (debugProfiling.enabled) {
          debugProfiling("Profiling " + (Date.now() - now) + "ms");
        }
        callback(null, true);
      });
  }
  callback(null, false);

};
