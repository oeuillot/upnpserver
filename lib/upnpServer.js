/*jslint node: true, vars: true, nomen: true */
"use strict";

var Async = require("async");
var events = require('events');
var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var Path = require('path');
var send = require('send');
var Url = require('url');
var util = require('util');
var _ = require('underscore');

var debugFactory = require('debug');
var debug = debugFactory('upnpserver:server');
var debugProfiling = debugFactory('upnpserver:profiling');

var logger = require('./logger');
var Item = require('./node');
var xmlFilters = require("./xmlFilters").xmlFilters;

var Service = require("./service");
var ContentDirectoryService = require("./contentDirectoryService");
var ConnectionManagerService = require("./connectionManagerService");
var MediaReceiverRegistrarService = require("./mediaReceiverRegistrarService");

var DESCRIPTION_PATH = "/device/mediaserver/description.xml";
var PRESENTATION_URL = "/index.html";
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
  this.MicrosoftSupport = !!configuration.microsoft;

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
  this.presentationURL = PRESENTATION_URL;
  this.iconPath = ICON_PATH;
  this.type = "urn:schemas-upnp-org:device:MediaServer:1";

  if (!configuration.services) {
    configuration.services = [ new ConnectionManagerService(configuration),
        new ContentDirectoryService(configuration) ];

    if (this.MicrosoftSupport && this.dlnaSupport) {
      configuration.services.push(new MediaReceiverRegistrarService(
          configuration));
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

util.inherits(UpnpServer, events.EventEmitter);

/**
 *
 * @param {Repository[]}
 *            repositories
 * @param {Function}
 *            callback
 * @deprecated
 */
UpnpServer.prototype.setRepositories = function(repositories, callback) {
  this.addRepositories(repositories, callback);
};

UpnpServer.prototype.addRepositories = function(repositories, callback) {
  Async.each(this.services, function(service, callback) {
    if (service instanceof ContentDirectoryService) {
      service.addRepositories(repositories, callback);
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

    self.emit("newService", service);

    callback(null, service);
  });

};

UpnpServer.prototype.toJXML = function(request, callback) {
  var localhost = request.myHostname;
  var localport = request.socket.localPort;

  var xml = {
    _name : "root",
    _attrs : {
      xmlns : Service.UPNP_DEVICE_XMLNS,
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
        deviceType : "urn:schemas-upnp-org:device:MediaServer:1",
        friendlyName : this.name,
        manufacturer : this.packageDescription.author,
        manufacturerURL : "https://github.com/oeuillot/upnpserver",
        modelDescription : "Node upnp server",
        modelName : "Windows Media Connect compatible (Node upnpserver)",
        modelURL : "https://github.com/oeuillot/upnpserver",
        modelNumber : this.packageDescription.version,
        serialNumber : "1.2",
        // attempt to make windows media player to "recognise this device"
        "pnpx:X_deviceCategory":"MediaDevices",
        "df:X_deviceCategory":"Multimedia",
        UDN : this.uuid,
        presentationURL : "http://" + localhost + ":" + localport +
            this.presentationURL,

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
      }
    // URLBase : "http://" + localhost + ":" + localport + "/"
    }
  };

  if (this.dlnaSupport) {
    xml._attrs["xmlns:dlna"] = ContentDirectoryService.DLNA_DEVICE_XMLNS;
    xml._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
  }

  this.services.forEach(function(service) {
    xml._content.device.serviceList.push(service.serviceToJXml());
  });

  return callback(null, xml);
};

UpnpServer.prototype.externalIp = function(ipFamily, iface){
  
}

UpnpServer.prototype.processRequest = function(request, response, path,
    callback) {

  var now;
  if (debugProfiling.enabled) {
    now = Date.now();
  }

  var localhost = request.socket.localAddress;
  if (localhost === '::1') {
    localhost = "127.0.0.1";
  } else {
    var ip6 = /::ffff:(.*)+/.exec(localhost);
    if (ip6) {
      localhost = ip6[1];
    }
  }

  request.myHostname = localhost;

  response.setHeader("Server", this.serverName);

  response.sendDate = true;

  // Handle /presentationURL
  if (path.indexOf(this.presentationURL) === 0) {
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

  if (this.dlnaSupport) {
    // Thanks to smolleyes for theses lines
    response.setHeader('transferMode.dlna.org', 'Streaming');
    response
        .setHeader('contentFeatures.dlna.org',
            'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');
  }

  // Problem with Samsung AllShare Play
  path = path.replace(/\/\//g, "/");

  logger.debug("Request='" + path + "' from='" +
      request.connection.remoteAddress + "'");

  if (path === '/') {
    path = this.descriptionPath;
  }

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

      if (debug.enabled) {
        debug("Descript Path request: returns: " + xml);
      }

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

    if (debug.enabled) {
      debug("Send icon '" + path + "'");
    }

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

    if (debugProfiling.enabled) {
      debugProfiling("Profiling " + (Date.now() - now) + "ms");
    }
    callback(null, processed);
  });
};
