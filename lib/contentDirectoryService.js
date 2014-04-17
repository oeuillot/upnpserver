/*jslint node: true, vars: true, nomen: true */
"use strict";

var fs = require('fs');
var Buffer = require('buffer').Buffer;
var Util = require('util');
var Path = require('path');

var Async = require("async");
var Mime = require('mime');
var jstoxml = require('jstoxml');
var send = require('send');

var logger = require('./logger');
var Service = require("./service");
var Item = require('./item');
var ItemWeakHashmap = require('./itemWeakHashmap');
var xmlFilters = require("./xmlFilters").xmlFilters;

var CONTENT_PATH = "/content/";

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
  this.addAction("GetSortCapabilities", [], [ {
    name : "SortCaps",
    type : "SortCapabilities"
  } ]);
  this.addAction("GetSystemUpdateID", [], [ {
    name : "Id",
    type : "SystemUpdateID"
  } ]);
  this.addAction("GetSearchCapabilities", [], [ {
    name : "SearchCaps",
    type : "SearchCapabilities"
  } ]);
  this.addAction("Search", [ {
    name : "ContainerID",
    type : "A_ARG_TYPE_ObjectID"
  }, {
    name : "SearchCriteria",
    type : "A_ARG_TYPE_SearchCriteria"
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

  this.addType("A_ARG_TYPE_BrowseFlag", false, "string", [ "BrowseMetadata",
      "BrowseDirectChildren" ]);
  this.addType("ContainerUpdateIDs", true, "string");
  this.addType("SystemUpdateID", true, "ui4");
  this.addType("A_ARG_TYPE_Count", false, "ui4");
  this.addType("A_ARG_TYPE_SortCriteria", false, "string");
  this.addType("A_ARG_TYPE_SearchCriteria", false, "string");
  this.addType("SortCapabilities", false, "string");
  this.addType("A_ARG_TYPE_Index", false, "ui4");
  this.addType("A_ARG_TYPE_ObjectID", false, "string");
  this.addType("A_ARG_TYPE_UpdateID", false, "ui4");
  this.addType("A_ARG_TYPE_Result", false, "string");
  this.addType("SearchCapabilities", false, "string");
  this.addType("A_ARG_TYPE_Filter", false, "string");

  this._childrenWeakHashmap = new ItemWeakHashmap(100, true);
  this.repositories = [];
  this.systemUpdateId = 0;
  this._previousSystemUpdateId = -1;
  this.updateIds = {};
  this.contentPath = CONTENT_PATH;
};

Util.inherits(ContentDirectoryService, Service);

ContentDirectoryService.prototype.initialize = function(upnpServer, callback) {
  var self = this;

  this.searchClasses = [ {
    name : Item.AUDIO_FILE,
    includeDerived : true
  }, {
    name : Item.IMAGE_FILE,
    includeDerived : true
  }, {
    name : Item.VIDEO_FILE,
    includeDerived : true
  } ];

  Service.prototype.initialize.call(this, upnpServer, function(error) {
    if (error) {
      return callback(error);
    }

    var repositories = upnpServer.configuration.repositories;

    return self.setRepositories(repositories, function(error) {
      if (error) {
        return callback(error);
      }

      self._intervalTimer = setInterval(function() {
        self._sendItemChangesEvent();
      }, 1500);

      callback(null);
    });
  });
};

ContentDirectoryService.prototype.setRepositories = function(repositories,
    callback) {

  this.repositories = [];

  if (!repositories || !repositories.length) {
    return callback("no repositories");
  }

  var self = this;
  self.initializeRegistry(function(error) {

    self.newItem(null, "root", Item.CONTAINER, true, {
      searchable : false,
      restricted : true,

      searchClasses : self.searchClasses
    }, function(error, item) {
      if (error) {
        return callback(error);
      }

      self.root = item;
      item.service = self;

      repositories = repositories.slice(0);
      repositories.sort(function(r1, r2) {
        return r1.mountPath.length - r2.mountPath.length;
      });

      logger.info("Adding ", repositories.length, " repositories");

      Async.eachSeries(repositories, function(repository, callback) {

        logger.info("Adding repository", repository.mountPath);

        self.addRepository(repository, callback);

      }, function(error) {
        if (error) {
          return callback(error);
        }

        return callback(null);
      });
    });
  });
};

ContentDirectoryService.prototype.initializeRegistry = function(callback) {

  var configuration = this.upnpServer.configuration;
  var itemRegistryName = configuration.registryDb || "item";

  var ItemRegistryClass = require("./" + itemRegistryName + "Registry");
  this._itemRegistry = new ItemRegistryClass(configuration);

  var self = this;
  this._itemRegistry.initialize(this, function(error) {
    if (error) {
      return callback(error);
    }

    callback(null);
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
  ps.shift(); // Path must start with /, remove empty string first element

  // logger.debug("Process ", ps);

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
        // logger.debug("allocateItemsForPath(" + segment +
        // ")=>",item.id);
        return callback(null, item);
      }

      // logger.debug("allocateItemsForPath(" + segment+ ")=> NEW
      // CONTAINER");

      self.newContainer(parentItem, segment, null, true, null, callback);
    });
  }, callback);
};

ContentDirectoryService.prototype.processSoap_GetSystemUpdateID = function(xml,
    request, response, callback) {

  var self = this;
  this.responseSoap(response, "GetSystemUpdateID", {
    _name : "u:SystemUpdateID",
    _attrs : {
      "xmlns:u" : this.type
    },
    _content : {
      Id : self.systemUpdateId
    }
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

    var found;
    xml.eachChild(function(c) {
      found = childNamed(c, name);
      if (found) {
        return false;
      }
    });

    return found;
  }

  var browseFlag = null;
  var node = childNamed(xml, "BrowseFlag");
  if (node) {
    browseFlag = node.val;
  }

  var filter = null;
  node = childNamed(xml, "Filter");
  if (node) {
    filter = node.val;
  }

  var objectId = this.root.id;
  node = childNamed(xml, "ObjectID");
  if (node) {
    objectId = parseInt(node.val, 10);
  }

  logger.info("CDS: Browse starting  (flags=" + browseFlag + ") of item "
      + objectId);

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

  if (browseFlag === "BrowseMetadata") {
    return this.responseObject(response, request, objectId, filter, callback);
  }

  if (browseFlag === "BrowseDirectChildren") {
    return this.responseContainer(response, request, objectId, filter,
        startingIndex, requestedCount, sortCriteria, callback);
  }

  callback("Unknown browseFlag '" + browseFlag + "'");
};

ContentDirectoryService.prototype.responseObject = function(response, request,
    objectId, filter, callback) {

  logger.info("Request ObjectId=" + objectId);

  var self = this;
  this.getItemById(objectId, function(error, item) {

    if (error) {
      return callback(error);
    }
    if (!item) {
      return callback("CDS: BrowseObject Can not find item " + objectId);
    }
    logger.info("CDS: BrowseObject itemId=", item.id, " error=", error);

    var localhost = request.socket.localAddress;
    var localport = request.socket.localPort;

    var repositoryRequest = {
      contentURL : "http://" + localhost + ":" + localport + self.contentPath,
      request : request
    };

    if (!item.toJXML) {
      logger.warn("ALERT not an item ", item);
      return callback("Not an item");
    }

    var itemXML = item.toJXML(repositoryRequest);

    var xmlDidl = {
      _name : "DIDL-Lite",
      _attrs : {
        "xmlns" : "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
        "xmlns:dc" : "http://purl.org/dc/elements/1.1/",
        "xmlns:upnp" : "urn:schemas-upnp-org:metadata-1-0/upnp/"
      },
      _content : itemXML
    };

    if (self.upnpServer.dlnaSupport) {
      xmlDidl._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:metadata-1-0/";
    }

    var didl = jstoxml.toXML(xmlDidl, {
      header : false,
      indent : " ",
      filter : xmlFilters
    });

    debugger;
    console.log("didl=", didl);

    self.responseSoap(response, "Browse", {
      _name : "u:BrowseResponse",
      _attrs : {
        "xmlns:u" : self.type
      },
      _content : {
        Result : didl,
        NumberReturned : 1,
        TotalMatches : 1,
        UpdateID : (item.id)
            ? item.itemUpdateId
            : self.systemUpdateId
      }
    }, function(error) {
      if (error) {
        return callback(error);
      }

      // logger.debug("CDS: Browse end " + containerId);
      callback(null);
    });
  });
};

ContentDirectoryService.prototype.responseContainer = function(response,
    request, containerId, filter, startingIndex, requestedCount, sortCriteria,
    callback) {

  logger.debug("Request containerId=" + containerId + " filter=" + filter
      + " startingIndex=" + startingIndex + " requestCount=" + requestedCount
      + " sortCriteria=" + sortCriteria);

  var self = this;
  this
      .getItemById(
          containerId,
          function(error, item) {

            if (error) {
              logger.error("CDS: Can not getItemById for id", containerId);
              return callback(error);
            }
            if (!item) {
              return callback("CDS: Browser Can not find item " + containerId);
            }

            logger.debug("CDS: Browser itemId=", item.id, " error=", error);

            item
                .listChildren(function(error, list) {
                  if (error) {
                    logger.warn("Can not scan repositories: ", error);
                    return callback(error);
                  }

                  // if (filter) {
                  // // We can apply filters
                  // }

                  if (sortCriteria) {
                    // We can make asked sort

                    list = list.slice(0).sort(function(i1, i2) {
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

                  // logger.debug("Generate ", list);

                  var lxml = [];

                  var xmlDidl = {
                    _name : "DIDL-Lite",
                    _attrs : {
                      "xmlns" : "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
                      "xmlns:dc" : "http://purl.org/dc/elements/1.1/",
                      "xmlns:upnp" : "urn:schemas-upnp-org:metadata-1-0/upnp/"
                    },
                    _content : lxml
                  };

                  if (self.upnpServer.dlnaSupport) {
                    xmlDidl._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:metadata-1-0/";
                  }

                  var localhost = request.socket.localAddress;
                  var localport = request.socket.localPort;

                  var repositoryRequest = {
                    contentURL : "http://" + localhost + ":" + localport
                        + self.contentPath,
                    request : request
                  };

                  list.forEach(function(item) {

                    if (!item || !item.toJXML) {
                      logger.warn("ALERT not an item ", item);
                      return;
                    }

                    lxml.push(item.toJXML(repositoryRequest));
                  });

                  var didl = jstoxml.toXML(xmlDidl, {
                    header : false,
                    indent : "",
                    filter : xmlFilters
                  });

                  console.log("didl=", didl);

                  self.responseSoap(response, "Browse", {
                    _name : "u:BrowseResponse",
                    _attrs : {
                      "xmlns:u" : self.type
                    },
                    _content : {
                      Result : didl,
                      NumberReturned : count,
                      TotalMatches : total,
                      UpdateID : (item.id)
                          ? item.itemUpdateId
                          : self.systemUpdateId
                    }
                  }, function(error) {
                    if (error) {
                      return callback(error);
                    }

                    // logger.debug("CDS: Browse end " +
                    // containerId);
                    callback(null);
                  });

                });
          });
};

ContentDirectoryService.prototype.browseItem = function(item, callback) {
  var path = item.getPath();

  logger.debug("CDS: browseItem itemID=" + item.id + " path='" + path
      + "' repositories.count=" + this.repositories.length);

  Async.reduce(this.repositories, [], function(list, repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {

      logger.debug("CDS: browseItem repository mountPath="
          + repository.mountPath + " path=" + path + " is not in mountpath");

      return callback(null, list);
    }

    logger
        .debug("CDS: browseItem repository mountPath=" + repository.mountPath);

    repository.browse(list, item, function(error, result) {
      if (error) {
        logger.error("CDS: browseItem repository mountPath="
            + repository.mountPath + " error ", error);
        return callback(error);
      }

      if (!result || !result.length) {
        logger.debug("CDS: browseItem repository mountPath="
            + repository.mountPath + " => No result list=" + list.length);

        return callback(null, list);
      }

      logger.debug("CDS: browseItem repository mountPath="
          + repository.mountPath + " => " + result.length, " list="
          + list.length);

      // logger.debug("Browse => " + result);

      callback(null, list.concat(result));
    });

  }, function(error, list) {
    if (error) {
      logger.error("CDS: browseItem '" + path + "' returns error ", error);
      return callback(error);
    }

    logger.debug("CDS: browseItem '" + path + "' returns " + list.length
        + " elements.");

    return callback(null, list);
  });
};

ContentDirectoryService.prototype.newItem = function(parent, name, upnpClass,
    container, attributes, callback) {
  var item = new Item(parent, name, upnpClass, container, attributes);

  this.registerItem(item, function(error) {
    if (error) {
      logger.error("Register item error=", error);
      return callback(error);
    }

    return callback(null, item, item.id);
  });
};

ContentDirectoryService.prototype.newContainer = function(parent, name,
    upnpClass, virtual, attributes, callback) {

  if (virtual) {
    attributes = attributes || {};
    attributes.virtual = true;
  }

  return this.newItem(parent, name, upnpClass || Item.CONTAINER, true,
      attributes, callback);
};

ContentDirectoryService.prototype.newFolder = function(parent, path, stats,
    upnpClass, attributes, callback) {
  var name = Path.basename(path);

  attributes = attributes || {};
  attributes.realpath = path;

  var self = this;
  function waitStats(stats) {
    attributes.date = stats.mtime;

    return self.newContainer(parent, name, upnpClass, false, attributes,
        callback);
  }

  if (stats) {
    return waitStats(stats);
  }

  fs.stat(path, function(error, stats) {
    if (error) {
      return callback(error);
    }

    return waitStats(stats);
  });
};

ContentDirectoryService.prototype.computeTitle = function(name, path, mimeType,
    callback) {
  var title = name;
  var idx = title.lastIndexOf('.');
  if (idx > 0) {
    title = title.substring(0, idx);
  }

  // TODO customize title by filters
  idx = title.indexOf("__");
  if (idx > 0) {
    title = title.substring(0, idx);
  }

  callback(null, title);
};

ContentDirectoryService.prototype.newFile = function(parent, path, upnpClass,
    stats, attributes, callback) {

  attributes = attributes || {};
  attributes.realPath = path;

  var name = Path.basename(path);

  var mimeType = (stats && stats.mimeType)
      || Mime.lookup(Path.extname(path).substring(1),
          "application/octet-stream");

  var self = this;
  self.computeTitle(name, path, mimeType,
      function(error, title) {
        if (error) {
          return callback(error);
        }

        if (!title) {
          title = name;
        }

        attributes.title = title;

        attributes.resAttrs = {
          protocolInfo : "http-get:*:" + mimeType + ":*"
        };

        function waitStats(stats) {
          attributes.resAttrs.size = stats.size;
          attributes.date = stats.mtime;

          return self.newItem(parent, name, upnpClass, false, attributes,
              callback);
        }

        if (stats) {
          return waitStats(stats);
        }

        fs.stat(path, function(error, stats) {
          if (error) {
            return callback(error);
          }

          return waitStats(stats);
        });
      });
};

ContentDirectoryService.prototype.newPhoto = function(parent, path, stats,
    attributes, callback) {
  return this.newFile(parent, path, Item.PHOTO_FILE, stats, attributes,
      callback);
};

ContentDirectoryService.prototype.newVideo = function(parent, path, stats,
    attributes, callback) {
  return this.newFile(parent, path, Item.VIDEO_FILE, stats, attributes,
      callback);
};

ContentDirectoryService.prototype.newAudio = function(parent, path, stats,
    attributes, callback) {
  return this.newFile(parent, path, Item.AUDIO_FILE, stats, attributes,
      callback);
};

ContentDirectoryService.prototype.registerUpdate = function(item) {
  this.systemUpdateId++;
  this.updateIds[item.id] = item.itemUpdateId;
};

ContentDirectoryService.prototype.updateItem = function(item, callback) {
  // Il faut identifier le repository associé à cet item

  var path = item.getPath();

  logger.debug("CDS: updateItem itemID=" + item.id + " path='" + path
      + "' repositories.count=" + this.repositories.length);

  Async.each(this.repositories, function(repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {
      logger.debug("CDS: browseItem repository mountPath="
          + repository.mountPath + " path is not in mountpath");
      return callback(null);
    }

    logger
        .debug("CDS: updateItem repository mountPath=" + repository.mountPath);

    repository.update(item, function(error, result) {
      if (error) {
        logger.error("CDS: updateItem repository mountPath="
            + repository.mountPath + " error ", error);
        return callback(error);
      }

      callback(null);
    });

  }, function(error) {
    if (error) {
      logger.error("CDS: updateItem '" + path + "' returns error ", error);
      return callback(error);
    }

    logger.debug("CDS: updateItem '" + path + "'.");

    return callback(null);
  });
};

ContentDirectoryService.prototype.registerItem = function(item, callback) {
  this._itemRegistry.registerItem(item, callback);
};

ContentDirectoryService.prototype.getItemById = function(id, callback) {
  this._itemRegistry.getItemById(id, callback);
};

ContentDirectoryService.prototype.processRequest = function(request, response,
    path, callback) {

  var contentPath = this.contentPath;

  if (path.indexOf(contentPath) === 0) {
    var id = parseInt(path.substring(contentPath.length), 10);

    logger.debug("Request resourceId=", id);

    return this.getItemById(id, function(error, item) {
      if (error) {
        return callback(error);
      }
      if (!item || !item.id) {
        logger.error("SendItem itemId=", id, " not found");

        response.writeHead(404, 'Resource not found: ' + id);
        response.end();
        return callback(null, true);
      }

      // logger.debug("Request item=", item);

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
  }

  if (path === "/tree") {
    return this.getItemById(0, function(error, item) {
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
  }

  return Service.prototype.processRequest.apply(this, arguments);
};

ContentDirectoryService.prototype._sendItemChangesEvent = function() {
  if (this._previousSystemUpdateId == this.systemUpdateId) {
    // return;
  }
  this._previousSystemUpdateId = this.systemUpdateId;
  var oldUpdateIds = this.updateIds;
  this.updateIds = {};

  var xmlContent = [ {
    _name : "e:property",
    _content : {
      _name : "s:SystemUpdateID",
      _attrs : {
        "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
        "dt:dt" : "ui4"
      },
      _content : this.systemUpdateId

    }
  } ];

  var messageArray = [];
  for ( var key in oldUpdateIds) {
    var updateId = oldUpdateIds[key];
    if (!updateId) {
      continue;
    }
    messageArray.push(key, updateId);
  }

  if (true || messageArray.length) {

    var message = messageArray.join(",");

    xmlContent.push({
      _name : "e:property",
      _content : {
        _name : "s:ContainerUpdateIDs",
        _attrs : {
          "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
          "dt:dt" : "string"
        },
        _content : message

      }
    });
  }

  xmlContent = {
    _name : "e:propertyset",
    _attrs : {
      xmlns : "urn:schemas-upnp-org:service-1-0",
      "xmlns:e" : "urn:schemas-upnp-org:event-1-0",
      "xmlns:s" : "urn:schemas-upnp-org:service:ContentDirectory:1"
    },
    _content : xmlContent
  };

  this.sendEvent("upnp:propchange", xmlContent);

};

module.exports = ContentDirectoryService;