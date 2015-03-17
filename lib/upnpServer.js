/*jslint node: true, vars: true, nomen: true */
"use strict";

var Url = require('url');
var Path = require('path');

var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var send = require('send');
var _ = require('underscore');
var Async = require("async");

var logger = require('./logger');
var Item = require('./node');
var xmlFilters = require("./xmlFilters").xmlFilters;

var ContentDirectoryService = require("./contentDirectoryService");
var ConnectionManagerService = require("./connectionManagerService");
var MediaReceiverRegistrarService = require("./mediaReceiverRegistrarService");

var DESCRIPTION_PATH = "/DeviceDescription.xml";
var ICON_PATH = "/icons/";
var DEFAULT_LANGUAGE = "en";

var UpnpServer = function(port, _configuration, callback) {

  var configuration = _.clone(_configuration || {});
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
        "UPnPServer/" + this.packageDescription.version ];

    if (this.dlnaSupport) {
      ns.push("DLNADOC/1.50");
    }

    this.serverName = ns.join(" ");
  }

  this.port = port;
  this.services = [];
  this.descriptionPath = DESCRIPTION_PATH;
  this.iconPath = ICON_PATH;
  this.type = "urn:schemas-upnp-org:device:MediaServer:1";

  if (!configuration.services) {
    configuration.services = [ new ConnectionManagerService(),
        new ContentDirectoryService() ];

    if (this.dlnaSupport) {
      configuration.services.push(new MediaReceiverRegistrarService());
    }
  }

  var self = this;
  Async.each(configuration.services, function(service, callback) {
    self.addService(service, callback);

  }, function(error) {
    if (error) {
      return callback(error, self);
    }

    return callback(null, self);
  });
};
module.exports = UpnpServer;

UpnpServer.prototype.setRepositories = function(repositories, callback) {

  var self = this;

  // BEWARE : callback is now called with only 1 parameter (error)

  Async.each(this.services, function(service, callback) {
    if (service instanceof ContentDirectoryService) {
      service.setRepositories(repositories, callback);
    }
  }, callback);
};

UpnpServer.prototype.addService = function(service, callback) {
  var self = this;
  service.initialize(this, function(error) {
    if (error) {
      return callback(error);
    }

    self.services.push(service);

    callback(null, service);
  });

};

UpnpServer.prototype.toJXML = function(request, callback) {
  var localhost = request.myHostname;
  var localport = request.socket.localPort;

  var xml = {
    _name : "root",
    _attrs : {
      xmlns : "urn:schemas-upnp-org:device-1-0"

    },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      device : {
        deviceType : "urn:schemas-upnp-org:device:MediaServer:1",
        friendlyName : this.name,
        manufacturer : this.packageDescription.author,
        manufacturerURL : "https://github.com/oeuillot/upnpserver",
        modelDescription : "Node upnp server",
        modelName : "Windows Media Connect compatible (Node upnpserver)",
        modelURL : "https://github.com/oeuillot/upnpserver",
        modelNumber : this.packageDescription.version,
        serialNumber : "1.2",

        UDN : this.uuid,
        presentationURL : "http://" + localhost + ":" + localport + "/",

        iconList : [ {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 32,
            height : 32,
            depth : 24,
            url : this.iconPath + "icon_32.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 128,
            height : 128,
            depth : 24,
            url : this.iconPath + "icon_128.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 512,
            height : 512,
            depth : 24,
            url : this.iconPath + "icon_512.png"
          }
        } ],

        serviceList : []
      },
      URLBase : "http://" + localhost + ":" + localport + "/"
    }
  };

  if (this.dlnaSupport) {
    xml._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:device-1-0";
    xml._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
  }

  this.services.forEach(function(service) {
    xml._content.device.serviceList.push(service.serviceToJXml());
  });

  return callback(null, xml);
};

UpnpServer.prototype.processRequest = function(request, response, path,
    callback) {

  var localhost = request.socket.localAddress;
  var ip6 = /::ffff:(.*)+/.exec(localhost);
  if (ip6) {
    localhost = ip6[1];
  }

  request.myHostname = localhost;

  response.setHeader("Server", this.serverName);

  if (this.dlnaSupport) {
    // Thanks to smolleyes for theses lines
    response.setHeader('transferMode.dlna.org', 'Streaming');
    response
        .setHeader('contentFeatures.dlna.org',
            'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000');
  }

  response.sendDate = true;

  // Problem with Samsung AllShare Play
  if (path.match(/^\/\//)) {
    path = path.substring(1);
  }

  logger.debug("Request='" + path + "' from='" +
      request.connection.remoteAddress + "'");

  if (path === this.descriptionPath) {
    return this.toJXML(request, function(error, xmlObject) {
      if (error) {
        return callback(error);
      }

      var xml = jstoxml.toXML(xmlObject, {
        header : true,
        indent : " ",
        filter : xmlFilters
      });

      // logger.verbose("Request description path: " + xml);
      response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");

      response.end(xml, "UTF-8");
      return callback(null, true);
    });
  }

  if (path.indexOf(this.iconPath) === 0) {
    path = path.substring(this.iconPath.length);
    path = path.replace(/\.\./g, "").replace(/\\/g, "").replace(/\//g, "");

    var dir = __dirname;
    dir = dir.substring(0, dir.lastIndexOf(Path.sep));

    path = dir + ("/icon/" + path).replace(/\//g, Path.sep);

    logger.debug("Send icon '" + path + "'");

    send(request, path).pipe(response);
    return callback(null, true);
  }

  var processed = false;
  Async.eachSeries(this.services, function(service, callback) {
    if (processed) {
      return callback(null);
    }
    service.processRequest(request, response, path, function(error, found) {
      if (error) {
        return callback(error);
      }

      if (found) {
        processed = true;
      }
      callback(null);
    });
  }, function(error) {
    if (error) {
      return callback(error);
    }

    callback(null, processed);
  });
};
