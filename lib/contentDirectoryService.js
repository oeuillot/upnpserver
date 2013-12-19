var Service = require("./service");
var Async = require("async");
var Util = require('util');
var fs = require('fs');
var Item = require('./item');
var Mime = require('mime');
var Path = require('path');
var jstoxml = require('jstoxml');

var ContentDirectoryService = function() {
	Service.call(this, {
		serviceType : "urn:schemas-upnp-org:service:ContentDirectory:1",
		serviceId : "urn:upnp-org:serviceId:ContentDirectory",
		scpdURL : "/cds.xml",
		controlURL : "/cds/control",
		eventSubURL : "/cds/event"
	});

	this.addAction("Browse", [ {
		name : "ObjectID",
		type : "A_ARG_TYPE_ObjectID"
	}, {
		name : "BrowseFlag",
		type : "A_ARG_TYPE_BrowseFlag"
	}, {
		name : "Filter",
		type : "A_ARG_TYPE_Filter"
	}, {
		name : "StartingIndex",
		type : "A_ARG_TYPE_Index"
	}, {
		name : "RequestedCount",
		type : "A_ARG_TYPE_Count"
	}, {
		name : "SortCriteria",
		type : "A_ARG_TYPE_SortCriteria"
	} ], [ {
		name : "Result",
		type : "A_ARG_TYPE_Result"
	}, {
		name : "NumberReturned",
		type : "A_ARG_TYPE_Count"
	}, {
		name : "TotalMatches",
		type : "A_ARG_TYPE_Count"
	}, {
		name : "UpdateID",
		type : "A_ARG_TYPE_UpdateID"
	} ]);

	this.addAction("GetSearchCapabilities", [], [ {
		name : "SearchCaps",
		type : "SearchCapabilities"
	} ]);
	this.addAction("GetSortCapabilities", [], [ {
		name : "SortCaps",
		type : "SortCapabilities"
	} ]);
	this.addAction("GetSystemUpdateID", [], [ {
		name : "Id",
		type : "SystemUpdateID"
	} ]);

	this.addType("A_ARG_TYPE_BrowseFlag", false, "string", [ "BrowseMetadata",
			"BrowseDirectChildren" ]);
	this.addType("SystemUpdateID", true, "ui4");
	this.addType("ContainerUpdateIDs", true, "string");
	this.addType("A_ARG_TYPE_Count", false, "ui4");
	this.addType("A_ARG_TYPE_SortCriteria", false, "string");
	this.addType("SortCapabilities", false, "string");
	this.addType("A_ARG_TYPE_Index", false, "ui4");
	this.addType("A_ARG_TYPE_ObjectID", false, "string");
	this.addType("A_ARG_TYPE_UpdateID", false, "ui4");
	this.addType("A_ARG_TYPE_Result", false, "string");
	this.addType("SearchCapabilities", false, "string");
	this.addType("A_ARG_TYPE_Filter", false, "string");

	this.repositories = [];
};

Util.inherits(ContentDirectoryService, Service);

module.exports = ContentDirectoryService;

ContentDirectoryService.prototype.initialize = function(upnpServer, callback) {
	var self = this;

	Service.prototype.initialize.call(this, upnpServer, function(error) {
		if (error) {
			return callback(error);
		}

		var configuration = upnpServer.configuration;

		if (!configuration.repositories) {
			return callback("no repositories");
		}

		var repositories = configuration.repositories.slice(0);
		repositories.sort(function(r1, r2) {
			return r1.mountPath.length - r2.mountPath.length;
		});

		self.newItem(null, "$root", "$root", function(error, item) {
			if (error) {
				return callback(error);
			}

			self.root = item;
			item.service = self;
			item.virtual = true;

			console.log("Adding ", repositories.length, " repositories");

			Async.eachSeries(repositories, function(repository, callback) {

				console.log("Adding repository", repository.mountPath);

				self.addRepository(repository, callback);

			}, function(error) {
				if (error) {
					return callback(error);
				}

				if (false) {
					console.log(Util.inspect(self, {
						depth : null
					}));
				}

				callback(null, self);
			});
		});
	});
};

ContentDirectoryService.prototype.addRepository = function(repository, callback) {
	var self = this;
	repository.initialize(this, function(error) {
		if (error) {
			return callback(error);
		}

		self.repositories.push(repository);
		callback(null, repository);
	});
};

ContentDirectoryService.prototype.allocateItemsForPath = function(path,
		callback) {

	var ps = path.split("/");
	ps.shift(); // Ca doit commencer par /

	// console.log("Process ", ps);

	if (ps.length < 1 || !ps[0]) {

		return callback(null, this.root);
	}

	var self = this;
	Async.reduce(ps, this.root, function(parentItem, segment, callback) {

		parentItem.getChildByName(segment, function(error, item) {
			if (error) {
				return callback(error);
			}

			if (item) {
				item.virtual = true;

				// console.log("allocateItemsForPath(" + segment +
				// ")=>",item.itemId);
				return callback(null, item);
			}

			// console.log("allocateItemsForPath(" + segment+ ")=> NEW
			// CONTAINER");

			self.newContainer(parentItem, segment, function(error, item) {
				if (error) {
					return callback(error);
				}

				item.virtual = true;

				return callback(null, item);
			});
		});
	}, callback);
};

ContentDirectoryService.prototype.processSoap_GetSearchCapabilities = function(
		xml, request, response, callback) {

	this.responseSoap(response, "GetSearchCapabilities", {
		_name : "u:GetSearchCapabilitiesResponse",
		_attrs : {
			"xmlns:u" : this.type
		},
		_content : {
			SearchCaps : {}
		}
	}, callback);
};

ContentDirectoryService.prototype.processSoap_GetSortCapabilities = function(
		xml, request, response, callback) {

	this.responseSoap(response, "GetSortCapabilities", {
		_name : "u:GetSortCapabilitiesResponse",
		_attrs : {
			"xmlns:u" : this.type
		}
	}, callback);
};

ContentDirectoryService.prototype.processSoap_Browse = function(xml, request,
		response, callback) {
	function childNamed(xml, name) {
		var child = xml.childNamed(name);
		if (child) {
			return child;
		}

		var found = undefined;
		xml.eachChild(function(c) {
			found = childNamed(c, name);
			if (found) {
				return false;
			}
		});

		return found;
	}

	var containerId = this.root.itemId;
	var node = childNamed(xml, "ContainerID");
	if (node) {
		containerId = parseInt(node.val, 10);
	} else {
		var node = childNamed(xml, "ObjectID");
		if (node) {
			containerId = parseInt(node.val, 10);
		}
	}

	console.log("CDS: Browse starting ... " + containerId);

	var browseFlag = null;
	node = childNamed(xml, "BrowseFlag");
	if (node) {
		browseFlag = node.val;
	}

	var filter = null;
	node = childNamed(xml, "Filter");
	if (node) {
		filter = node.val;
	}

	var startingIndex = -1;
	node = childNamed(xml, "StartingIndex");
	if (node) {
		startingIndex = parseInt(node.val, 10);
	}

	var requestedCount = -1;
	node = childNamed(xml, "RequestedCount");
	if (node) {
		requestedCount = parseInt(node.val, 10);
	}

	var sortCriteria = null;
	node = childNamed(xml, "SortCriteria");
	if (node) {
		sortCriteria = node.val;
	}

	console.log("Request containerId=" + containerId + " browseFlag="
			+ browseFlag + " filter=" + filter + " startingIndex="
			+ startingIndex + " requestCount=" + requestedCount
			+ " sortCriteria=" + sortCriteria);

	var self = this;
	this.upnpServer.getItemById(containerId, function(error, item) {
		console.log("CDS: Browser itemId=", item.itemId, " error=", error);

		if (error) {
			return callback(error);
		}
		if (!item) {
			return callback("Can not find item " + containerId);
		}

		item.listChildren(function(error, list) {
			if (error) {
				console.log("Can not scan repositories: ", error);
				return callback(error);
			}

			if (false) {
				console.log("CDS: List itemId=", item.itemId, " path=",
						item.path, " error=", error, " list=", list.length,
						" startingIndex=", startingIndex, " requesteCount=",
						requestedCount);
			}

			if (filter) {
				// We can apply filters
			}

			if (sortCriteria) {
				// We can make asked sort

				list = list.slice(0).sort(function(i1, ie2) {
					var n1 = (i1.title || i1.name);
					var n2 = (i2.title || i2.name);

					if (n1 < n2) {
						return -1;
					}
					if (n2 > n1) {
						return 1;
					}

					return 0;
				});
			}

			var total = list.length;

			if (startingIndex > 0) {
				if (startingIndex > list.length) {
					list = [];
				} else {
					list = list.slice(startingIndex);
				}
			}
			if (requestedCount > 0) {
				list = list.slice(0, requestedCount);
			}

			var count = list.length;

			// console.log("Generate ", list);

			var lxml = [];

			var xmlDidl = {
				_name : "DIDL-Lite",
				_attrs : {
					"xmlns:dc" : "http://purl.org/dc/elements/1.1/",
					"xmlns:upnp" : "urn:schemas-upnp-org:metadata-1-0/upnp/",
					"xmlns" : "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
				},
				_content : lxml
			};

			var localhost = request.socket.localAddress;
			var localport = request.socket.localPort;

			var repositoryRequest = {
				contentURL : "http://" + localhost + ":" + localport
						+ self.upnpServer.contentPath,
				request : request
			};

			list.forEach(function(item) {
				lxml.push(item.toJXML(repositoryRequest));
			});

			var didl = jstoxml.toXML(xmlDidl, {
				header : false,
				indent : " "
			});

			self.responseSoap(response, "Browse", {
				_name : "u:BrowseResponse",
				_attrs : {
					"xmlns:u" : self.type
				},
				_content : {
					NumberReturned : count,
					TotalMatches : total,
					UpdateID : 0,
					Result : "<![CDATA[" + didl + "]]>"
				}
			}, function(error) {
				if (error) {
					return callback(error);
				}

				// console.log("CDS: Browse end " + containerId);
				callback(null);
			});

		});
	});

};

ContentDirectoryService.prototype.browseItem = function(item, callback) {
	var path = item.getItemPath();
	var log = false;

	if (log) {
		console.log("CDS: browseItem itemID=" + item.itemId + " path='" + path
				+ "' repositories.count=" + this.repositories.length);
	}

	Async.reduce(this.repositories, [], function(list, repository, callback) {

		if (path.indexOf(repository.mountPath)) {
			if (log) {
				console.log("CDS: browseItem repository mountPath="
						+ repository.mountPath + " path is not in mountpath");
			}
			return callback(null, list);
		}

		if (log) {
			console.log("CDS: browseItem repository mountPath="
					+ repository.mountPath);
		}

		repository.browse(list, item, function(error, result) {
			if (error) {
				console.error("CDS: browseItem repository mountPath="
						+ repository.mountPath + " error ", error);
				return callback(error);
			}

			if (!result || !result.length) {
				if (log) {
					console.log("CDS: browseItem repository mountPath="
							+ repository.mountPath + " => No result list="
							+ list.length);
				}

				return callback(null, list);
			}

			if (log) {
				console.log("CDS: browseItem repository mountPath="
						+ repository.mountPath + " => " + result.length,
						" list=" + list.length);
			}

			callback(null, list.concat(result));
		});

	}, function(error, list) {
		if (error) {
			console.error("CDS: browseItem '" + path + "' returns error ",
					error);
			return callback(error);
		}

		if (log) {
			console.log("CDS: browseItem '" + path + "' returns " + list.length
					+ " elements.");
		}
		return callback(null, list);
	});
};

ContentDirectoryService.prototype.newItem = function(parent, name, upnpClass,
		callback) {
	var item = new Item(parent, name, upnpClass);

	this.upnpServer.registerItem(item, function(error) {
		if (error) {
			console.error("Register item error=", error)
			return callback(error);
		}

		return callback(null, item, item.id);
	});
};

ContentDirectoryService.prototype.newContainer = function(parent, name,
		callback) {

	return this.newItem(parent, name, Item.STORAGE_FOLDER, callback);
};

ContentDirectoryService.prototype.newFolder = function(parent, path, stats,
		callback) {
	var name = Path.basename(path);

	return this.newContainer(parent, name, function(error, item, id) {
		if (error) {
			return callback(error);
		}

		item.path = path;

		if (stats) {
			item.setDate(stats.mtime);

			return callback(null, item, id);
		}

		fs.stat(path, function(error, stats) {
			if (error) {
				return callback(error);
			}

			item.setDate(stats.mtime);

			return callback(null, item, id);

		});
	});

};

ContentDirectoryService.prototype.newFile = function(parent, path, upnpClass,
		stats, callback) {
	var mimeType = (stats && stats.mimeType)
			|| Mime.lookup(Path.extname(path).substring(1),
					"application/octet-stream");

	var name = Path.basename(path);

	this.newItem(parent, name, upnpClass, function(error, item, id) {
		if (error) {
			return callback(error);
		}

		item.path = path;

		item.resAttrs = {
			protocolInfo : "http-get:*:" + mimeType + ":*"
		};

		if (stats) {
			item.resAttrs.size = stats.size;
			item.setDate(stats.mtime);

			return callback(null, item, id);
		}

		fs.stat(path, function(error, stats) {
			if (error) {
				return callback(error);
			}

			item.resAttrs.size = stats.size;
			item.setDate(stats.mtime);

			return callback(null, item, id);

		});
	});
};

ContentDirectoryService.prototype.newPhoto = function(parent, path, stats,
		callback) {
	return this.newFile(parent, path, "object.item.imageItem.photo", stats,
			callback);
};

ContentDirectoryService.prototype.newVideo = function(parent, path, stats,
		callback) {
	return this.newFile(parent, path, "object.item.videoItem", stats, callback);
};

ContentDirectoryService.prototype.newAudio = function(parent, path, stats,
		callback) {
	return this.newFile(parent, path, "object.item.audioItem", stats, callback);
};
