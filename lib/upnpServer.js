/*jslint node: true, vars: true, nomen: true */
"use strict";

var Url = require('url');
var Path = require('path');

var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var send = require('send');
var Underscore = require('underscore');
var Async = require("async");
var logger = require('./logger');
var Item = require('./item');

var ContentDirectoryService = require("./contentDirectoryService");
var ConnectionManagerService = require("./connectionManagerService");
var MediaReceiverRegistrarService = require("./mediaReceiverRegistrarService");

var DESCRIPTION_PATH = "/DeviceDescription.xml";
var CONTENT_PATH = "/content/";
var ICON_PATH = "/icons/";

var UpnpServer = function(port, _configuration, callback) {

    var configuration = Underscore.clone(_configuration || {});
    this.configuration = configuration;
    this.dlnaSupport = configuration.dlnaSupport;

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
    this.contentPath = CONTENT_PATH;
    this.iconPath = ICON_PATH;
    this.type = "urn:schemas-upnp-org:device:MediaServer:1";

    if (!configuration.services) {
	configuration.services = [ new ConnectionManagerService(),
		new ContentDirectoryService() ];

	if (this.dlnaSupport) {
	    configuration.services.push(new MediaReceiverRegistrarService());
	}
    }

    var itemRegistryName = configuration.registryDb || "itemRegistry";

    var ItemRegistryClass = require("./" + itemRegistryName);
    this._itemRegistry = new ItemRegistryClass(configuration);

    var self = this;
    this._itemRegistry.initialize(function(error) {
	if (error) {
	    return callback(error);
	}

	Async.each(configuration.services, function(service, callback) {
	    self.addService(service, callback);

	}, function(error) {
	    if (error) {
		return callback(error, self);
	    }

	    return callback(null, self);
	});
    });
};
module.exports = UpnpServer;

UpnpServer.prototype.setRepositories = function(repositories, callback) {

    var self = this;

    // Item.resetIdCount();

    this._itemRegistry.clear(function(error) {
	if (error) {
	    return callback(error, self);
	}
    });

    Async.each(this.services, function(service, callback) {
	if (service instanceof ContentDirectoryService) {
	    service.setRepositories(repositories, callback);
	}
    }, function(error) {
	if (error) {
	    return callback(error, self);
	}
	return callback(null, self);
    });
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

UpnpServer.prototype.toJXML = function(request) {
    var localhost = request.socket.localAddress;
    var localport = request.socket.localPort;

    var json = {
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
	json._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:device-1-0";
	json._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
    }

    this.services.forEach(function(service) {
	json._content.device.serviceList.push(service.serviceToJXml());
    });

    return json;
};

UpnpServer.prototype.processRequest = function(request, response, path,
	callback) {

    response.setHeader("Server", this.serverName);
    response.sendDate = true;

    logger.debug("Request='" + path + "' from='"
	    + request.connection.remoteAddress + "' contentPath='"
	    + this.contentPath + "'");

    if (path === this.descriptionPath) {
	var xml = jstoxml.toXML(this.toJXML(request), {
	    header : true,
	    indent : " "
	});

	// logger.verbose("Request description path: " + xml);
	response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
	response.end(xml, "UTF-8");
	return callback(null, true);
    }

    if (path === "/tree") {
	this.getItemById(0, function(error, item) {
	    if (error) {
		return callback(error);
	    }
	    item.treeString(function(error, string) {
		if (error) {
		    return callback(error);
		}

		response.end(string);
		callback(null, true);
	    });
	});
	return;
    }

    if (path.indexOf(this.iconPath) === 0) {
	path = path.substring(this.iconPath.length);
	path = path.replace(/\.\./g, "").replace(/\\/g, "").replace(/\//g, "");

	var dir = __dirname;
	dir = dir.substring(0, dir.lastIndexOf(Path.sep));

	path = dir + ("/icon/" + path).replace(/\//g, Path.sep);

	logger.debug("> Send icon '" + path + "'");

	send(request, path).pipe(response);
	return callback(null, true);
    }

    if (path.indexOf(this.contentPath) === 0) {
	var id = parseInt(path.substring(this.contentPath.length), 10);

	logger.debug("Request resourceId=", id);

	this.getItemById(id, function(error, item) {
	    if (error) {
		return callback(error);
	    }
	    if (!item || !item.path) {
		logger.error("SendItem itemId=", id, " not found");

		response.writeHead(404, 'Resource not found: ' + id);
		response.end();
		return callback(null, true);
	    }

	    logger.debug("Request item=", item);

	    var realpath = item.attributes.realPath;

	    if (!realpath) {
		response.writeHead(404, 'Resource not found: ' + id);
		response.end();
		return callback("Invalid realpath");
	    }

	    // logger.debug("> Send item '" + realpath + "'");

	    send(request, realpath).pipe(response);

	    return callback(null, true);
	});
	return;
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

UpnpServer.prototype.registerItem = function(item, callback) {
    this._itemRegistry.registerItem(item, callback);
};

UpnpServer.prototype.getItemById = function(id, callback) {
    this._itemRegistry.getItemById(id, callback);
};
