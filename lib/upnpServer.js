var Url = require('url');
var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var Send = require('send');
var Underscore = require('underscore');
var Async = require("async");
var Path = require('path');

var ContentDirectoryService = require("./contentDirectoryService");
var connectionManagerService = require("./connectionManagerService");

var DESCRIPTION_PATH = "/DeviceDescription.xml";
var CONTENT_PATH = "/content/";
var ICON_PATH = "/icons/";

var UpnpServer = function(port, _configuration, callback) {

	var configuration = Underscore.clone(_configuration || {});
	this.configuration = configuration;

	this.packageDescription = require("../package.json");

	this.name = configuration.name || "Node UPNP Server";
	this.uuid = configuration.uuid || Uuid.v4();
	if (this.uuid.indexOf("uuid:")) {
		this.uuid = "uuid:" + this.uuid;
	}

	this.port = port;
	this.services = [];
	this.descriptionPath = DESCRIPTION_PATH;
	this.contentPath = CONTENT_PATH;
	this.iconPath = ICON_PATH;
	this.type = "urn:schemas-upnp-org:device:MediaServer:1";

	if (!configuration.services) {
		configuration.services = [ connectionManagerService,
				new ContentDirectoryService() ];
	}
	
	var itemRegistryName=configuration.registryDb || "itemRegistry";

	var itemRegistryClass=require("./"+itemRegistryName);
	this._itemRegistry=new itemRegistryClass(configuration);
	
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
			xmlns : "urn:schemas-upnp-org:device-1-0",
			"xmlns:dlna" : "urn:schemas-dlna-org:device-1-0"
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
				modelName : "Node upnpserver",
				modelURL : "https://github.com/oeuillot/upnpserver",
				modelNumber : this.packageDescription.version,
				serialNumber : "1.0",

				UDN : this.uuid,
				presentationURL : "http://" + localhost + ":" + localport + "/",

				iconList : [ {
					_name : "icon",
					_content : {
						mimetype : "image/png",
						width : 32,
						height : 32,
						depth: 24,
						url : this.iconPath + "icon_32.png"
					},
				}, {
					_name : "icon",
					_content : {
						mimetype : "image/png",
						width : 128,
						height : 128,
						depth: 24,
						url : this.iconPath + "icon_128.png"
					},
				}, {
					_name : "icon",
					_content : {
						mimetype : "image/png",
						width : 512,
						height : 512,
						depth: 24,
						url : this.iconPath + "icon_512.png"
					},
				} ],

				serviceList : []
			},
			URLBase : "http://" + localhost + ":" + localport + "/"
		}
	};

	this.services.forEach(function(service) {
		json._content.device.serviceList.push(service.serviceToJXml());
	});

	return json;
};

UpnpServer.prototype.processRequest = function(request, response, path) {
	if (path == this.descriptionPath) {
		var xml = jstoxml.toXML(this.toJXML(request), {
			header : true,
			indent : " "
		});

		console.log("Desc=>" + xml);
		response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
		response.end(xml, "UTF-8");
		return true;
	}

	console
			.log("Request='" + path + "' contentPath='" + this.contentPath
					+ "'");

	if (path == "/tree") {
		this.getItemById(0, function(error, item) {
			if (error) {
				console.error(error);
				return true;
			}
			response.end(item.treeString());
			return;
		});
		return true;
	}

	if (!path.indexOf(this.iconPath)) {
		path = path.substring(this.iconPath.length);
		path = path.replace(/\.\./g, "").replace(/\\/g, "").replace(/\//g, "");
		
		var dir=__dirname;
		dir=dir.substring(0, dir.lastIndexOf(Path.sep));
		
		path = dir + ("/icon/" + path).replace(/\//g, Path.sep);

		console.log("> Send icon '" + path + "'");

		Send(request, path).pipe(response);
		return true;
	}

	if (!path.indexOf(this.contentPath)) {
		var id = parseInt(path.substring(this.contentPath.length), 10);

		this.getItemById(id, function(error, item) {
			if (error || !item || !item.path) {
				console.error("SendItem ", error, " itemId=", id);

				response.writeHead(404, 'Resource not found: ' + id);
				response.end();
				return true;
			}

			console.log("> Send item '" + item.path + "'");

			Send(request, item.path).pipe(response);
		});

		return true;
	}

	for (var i = 0; i < this.services.length; i++) {
		var service = this.services[i];

		if (service.processRequest(request, response, path)) {
			return true;
		}
	}

	return false;
};

UpnpServer.prototype.registerItem = function(item, callback) {
	this._itemRegistry.registerItem(item, callback);
};

UpnpServer.prototype.getItemById = function(id, callback) {
	this._itemRegistry.getItemById(id, callback);
};
