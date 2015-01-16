/*jslint node: true, vars: true, nomen: true */
"use strict";

var LOG_DIDL = false;

var fs = require('fs');
var Util = require('util');
var Path = require('path');
var url = require('url');
var assert = require('assert');

var Async = require("async");
var Mime = require('mime');
var jstoxml = require('jstoxml');
var send = require('send');

var logger = require('./logger');
var Service = require("./service");
var Node = require('./node');
var NodeWeakHashmap = require('./nodeWeakHashmap');
var xmlFilters = require("./xmlFilters").xmlFilters;

var UpnpItem = require('./class/object.item');

var CONTENT_PATH = "/content/";

var GARBAGE_DELAY_MS = 1000 * 6; // 60 * 60;

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

  this._childrenWeakHashmap = new NodeWeakHashmap(100, true);
  this.repositories = [];
  this.systemUpdateId = 0;
  this._previousSystemUpdateId = -1;
  this.updateIds = {};
  this.contentPath = CONTENT_PATH;
};

(function() {
  var itemClasses = {};
  ContentDirectoryService._itemClasses = itemClasses;

  var classes = [ "object.item", "object.container", "object.item.audioItem",
      "object.item.audioItem.musicTrack", "object.item.videoItem",
      "object.container.album", "object.container.album.musicAlbum",
      "object.container.person", "object.container.person.musicArtist",
      "object.container.genre", "object.container.genre.musicGenre" ];
  classes.forEach(function(clazz) {
    var Clz = require('./class/' + clazz);

    assert(typeof (Clz.UPNP_CLASS) === "string", "Invalid upnp class '" +
        clazz + "'");

    itemClasses[Clz.UPNP_CLASS] = new Clz();
  });
})();

Util.inherits(ContentDirectoryService, Service);

ContentDirectoryService.prototype.initialize = function(upnpServer, callback) {
  this.searchClasses = [ {
    name : UpnpItem.AUDIO_FILE,
    includeDerived : '0'
  }, {
    name : UpnpItem.IMAGE_FILE,
    includeDerived : '0'
  }, {
    name : UpnpItem.VIDEO_FILE,
    includeDerived : '0'
  } ];

  this.dlnaSupport = upnpServer.dlnaSupport;

  var self = this;
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

      if (upnpServer.configuration.garbageItems) {
        self._intervalGarbage = setInterval(function() {
          self._garbageItems();
        }, Math.floor(GARBAGE_DELAY_MS / 10));

        self._lastRequestDate = Date.now();
      }

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

    var i18n = self.upnpServer.configuration.i18n;

    self.newItem(null, "root", UpnpItem.CONTAINER, true, {
      searchable : false,
      restricted : true,
      searchClasses : self.searchClasses,
      title : i18n.ROOT_NAME,
      metadatas : [ {
        name : "upnp:writeStatus",
        content : "NOT_WRITABLE"
      } ]
    }, function(error, item) {
      if (error) {
        return callback(error);
      }

      self.root = item;
      item.service = self;

      repositories = repositories.slice(0); // clone
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
  var nodeRegistryName = configuration.registryDb || "node";

  var NodeRegistryClass = require("./" + nodeRegistryName + "Registry");
  this._nodeRegistry = new NodeRegistryClass(configuration);

  var self = this;
  this._nodeRegistry.initialize(this, function(error) {
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

        item.virtual = true;

        return callback(null, item);
      }

      // logger.debug("allocateItemsForPath(" + segment+ ")=> NEW
      // CONTAINER");

      self.newContainer(parentItem, segment, null, {
        virtual : true
      }, callback);
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
    },
    _content : {
      SortCaps : []
    // TODO "dc:title", "upnp:genre", "upnp:artist", "upnp:author", "upnp:album", "upnp:rating", "res@duration", "res@size" ]
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

  logger.info("CDS: Browse starting  (flags=" + browseFlag + ") of item " +
      objectId);

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
  this.getNodeById(objectId, function(error, item) {

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
      request : request,
      contentDirectoryService : self,
      dlnaSupport : self.dlnaSupport
    };

    function produceDidl(item, itemXML) {
      var xmlDidl = {
        _name : "DIDL-Lite",
        _attrs : {
          "xmlns" : "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
          "xmlns:dc" : "http://purl.org/dc/elements/1.1/",
          "xmlns:upnp" : "urn:schemas-upnp-org:metadata-1-0/upnp/"
        },
        _content : itemXML
      };

      if (repositoryRequest.dlnaSupport) {
        xmlDidl._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:metadata-1-0/";
      }

      var didl = jstoxml.toXML(xmlDidl, {
        header : false,
        indent : " ",
        filter : xmlFilters
      });

      if (LOG_DIDL) {
        console.log("BrowseObject didl=", didl);
      }

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
              ? item.itemUpdateId : self.systemUpdateId
        }
      }, function(error) {
        if (error) {
          return callback(error);
        }

        // logger.debug("CDS: Browse end " + containerId);
        callback(null);
      });
    }

    self.getNodeJXML(item, repositoryRequest, function(error, itemJXML) {
      if (error) {
        return callback(error);
      }

      return produceDidl(item, itemJXML, callback);
    });
  });
};

ContentDirectoryService.prototype.getNodeJXML = function(node,
    repositoryRequest, callback) {

  if (node.refID) {
    var self = this;
    this.getNodeById(node.refID, function(error, refNode) {
      if (error) {
        return callback(error);
      }

      self.getNodeJXML(refNode, repositoryRequest,
          function(error, refItemJXML) {
            if (error) {
              return callback(error);
            }

            refItemJXML._attrs.id = node.id;
            refItemJXML._attrs.refID = refNode.id;
            refItemJXML._attrs.parentID = node.parentId;

            return callback(null, refItemJXML);
          });
    });
    return;
  }

  var itemClass = ContentDirectoryService._itemClasses[node.upnpClass];
  assert(itemClass, "Upnp item class is not defined for " + node.upnpClass);

  itemClass.toJXML(node, repositoryRequest, function(error, itemJXML) {
    if (error) {
      return callback(error);
    }

    return callback(null, itemJXML);
  });
};

ContentDirectoryService.prototype.responseContainer = function(response,
    request, containerId, filter, startingIndex, requestedCount, sortCriteria,
    callback) {

  logger.debug("Request containerId=" + containerId + " filter=" + filter +
      " startingIndex=" + startingIndex + " requestCount=" + requestedCount +
      " sortCriteria=" + sortCriteria);

  var self = this;
  this
      .getNodeById(
          containerId,
          function(error, item) {

            if (error) {
              logger.error("CDS: Can not getNodeById for id", containerId);
              return callback(error);
            }
            if (!item) {
              return callback("CDS: Browser Can not find item " + containerId);
            }

            function processList(list) {

              // if (filter) {
              // // We can apply filters
              // }

              if (true || sortCriteria) {
                // We must sort

                list = list.slice(0).sort(function(i1, i2) {
                  var n1 = (i1.attributes.title || i1.name);
                  var n2 = (i2.attributes.title || i2.name);

                  if (n1 < n2) {
                    return -1;
                  }
                  if (n1 > n2) {
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

              var localhost = request.socket.localAddress;
              var localport = request.socket.localPort;

              var repositoryRequest = {
                contentURL : "http://" + localhost + ":" + localport +
                    self.contentPath,
                request : request,
                contentDirectoryService : self,
                dlnaSupport : self.dlnaSupport
              };

              if (repositoryRequest.dlnaSupport) {
                xmlDidl._attrs["xmlns:dlna"] = "urn:schemas-dlna-org:metadata-1-0/";
              }

              Async.eachSeries(list, function(item, callback) {
                if (!item) {
                  logger.warn("ALERT not an item ", item);
                  return callback(null, list);
                }

                self.getNodeJXML(item, repositoryRequest, function(error,
                    itemJXML) {
                  if (error) {
                    return callback(error);
                  }

                  lxml.push(itemJXML);
                  callback(null);
                });

              }, function(error) {
                if (error) {
                  return callback(error);
                }

                var didl = jstoxml.toXML(xmlDidl, {
                  header : false,
                  indent : "",
                  filter : xmlFilters
                });

                if (LOG_DIDL) {
                  console.log("BrowseContainer didl=", didl);
                }

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
                        ? item.itemUpdateId : self.systemUpdateId
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

            }

            if (item.refID) {
              self.getNodeById(item.refID, function(error, refItem) {

                if (error) {
                  logger.error("CDS: Can not getNodeById for REF id",
                      item.refID);
                  return callback(error);
                }
                if (!refItem) {
                  return callback("CDS: Browser Can not find REF item " +
                      item.refID);
                }

                refItem.listChildren(function(error, list) {
                  if (error) {
                    logger.warn("Can not scan repositories: ", error);
                    return callback(error);
                  }

                  return processList(list);
                });

              });
              return;
            }

            logger.debug("CDS: Browser itemId=", item.id, " error=", error);

            item.listChildren(function(error, list) {
              if (error) {
                logger.warn("Can not scan repositories: ", error);
                return callback(error);
              }

              return processList(list);
            });
          });
};

ContentDirectoryService.prototype.browseNode = function(item, callback) {
  var path = item.getPath();

  logger.debug("CDS: browseNode itemID=" + item.id + " path='" + path +
      "' repositories.count=" + this.repositories.length);

  Async.reduce(this.repositories, [], function(list, repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {

      logger.debug("CDS: browseNode repository mountPath=" +
          repository.mountPath + " path=" + path + " is not in mountpath");

      return callback(null, list);
    }

    logger
        .debug("CDS: browseNode repository mountPath=" + repository.mountPath);

    repository.browse(list, item, function(error, result) {
      if (error) {
        logger.error("CDS: browseNode repository mountPath=" +
            repository.mountPath + " error ", error);
        return callback(error);
      }

      if (!result || !result.length) {
        logger.debug("CDS: browseNode repository mountPath=" +
            repository.mountPath + " => No result list=" + list.length);

        return callback(null, list);
      }

      logger
          .debug("CDS: browseNode repository mountPath=" +
              repository.mountPath + " => " + result.length, " list=" +
              list.length);

      // logger.debug("Browse => " + result);

      callback(null, list.concat(result));
    });

  }, function(error, list) {
    if (error) {
      logger.error("CDS: browseNode '" + path + "' returns error ", error);
      return callback(error);
    }

    logger.debug("CDS: browseNode '" + path + "' returns " + list.length +
        " elements.");

    return callback(null, list);
  });
};

ContentDirectoryService.prototype.newItemRef = function(parent, targetItem,
    name, callback) {

  debugger;
  
  if (name === targetItem.title) {
    name = undefined;
  }

  var item = Node.createRef(parent, targetItem, name, undefined);

  this.registerNode(item, function(error) {
    if (error) {
      logger.error("Register item error=", error);
      return callback(error);
    }

    return callback(null, item, item.id);
  });

};

ContentDirectoryService.prototype.newItem = function(parent, name, upnpClass,
    isContainer, attributes, callback) {

  if (typeof (callback) !== "function") {
    throw new Error("Invalid callback parameter");
  }

  if (!upnpClass) {
    throw new Error("No upnpClass specified for '" + name + "'");
  }

  var itemClass = ContentDirectoryService._itemClasses[upnpClass];
  assert(itemClass, "Item class is not defined for " + upnpClass);

  var self = this;
  return itemClass.init(parent, name, upnpClass, isContainer, attributes,
      function(error, name, attributes) {
        if (error) {
          return callback(error);
        }

        var item = Node
            .create(parent, name, upnpClass, isContainer, attributes);

        self.registerNode(item, function(error) {
          if (error) {
            logger.error("Register item error=", error);
            return callback(error);
          }

          return callback(null, item, item.id);
        });
      });
};

ContentDirectoryService.prototype.newContainer = function(parent, name,
    upnpClass, attributes, callback) {

  assert(typeof (callback) === "function", "Invalid callback parameter");

  return this.newItem(parent, name, upnpClass || UpnpItem.CONTAINER, true,
      attributes, callback);
};

ContentDirectoryService.prototype.computeTitle = function(name, path, mimeType,
    callback) {
  var title = name;
  var idx = title.lastIndexOf('.');
  if (idx > 0) {
    title = title.substring(0, idx);
  }

  idx = title.indexOf("__");
  if (idx > 0) {
    title = title.substring(0, idx);
  }

  callback(null, title);
};

ContentDirectoryService.prototype.newFile = function(parent, path, upnpClass,
    stats, attributes, callback) {

  assert(typeof (callback) === "function", "Invalid callback parameter");

  attributes = attributes || {};
  attributes.realPath = path;

  var name = Path.basename(path);

  var mimeType = (stats && stats.mimeType) ||
      Mime.lookup(Path.extname(path).substring(1), "application/octet-stream");

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

        function waitStats(stats) {
          if (!self.upnpServer.configuration.strict && !attributes.size) {
            attributes.size = stats.size;
          }

          if (!attributes.date) {
            var t = stats.mtime;
            if (t) {
              if (t.getFullYear() >= 1970) {
                attributes.date = t.getTime();
              } else {
                attributes.date = t;
              }
            }
          }

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

ContentDirectoryService.prototype.registerUpdate = function(item) {
  this.systemUpdateId++;
  this.updateIds[item.id] = item.itemUpdateId;
};

ContentDirectoryService.prototype.updateItem = function(item, callback) {
  // Il faut identifier le repository associé à cet item

  var path = item.getPath();

  logger.debug("CDS: updateItem itemID=" + item.id + " path='" + path +
      "' repositories.count=" + this.repositories.length);

  Async.each(this.repositories, function(repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {
      logger.debug("CDS: browseNode repository mountPath=" +
          repository.mountPath + " path is not in mountpath");
      return callback(null);
    }

    logger
        .debug("CDS: updateItem repository mountPath=" + repository.mountPath);

    repository.update(item, function(error, result) {
      if (error) {
        logger.error("CDS: updateItem repository mountPath=" +
            repository.mountPath + " error ", error);
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

ContentDirectoryService.prototype.registerNode = function(item, callback) {
  this._nodeRegistry.registerNode(item, callback);
};

ContentDirectoryService.prototype.getNodeById = function(id, callback) {
  this._nodeRegistry.getNodeById(id, callback);
};

ContentDirectoryService.prototype.removeItemById = function(id, callback) {
  this._nodeRegistry.removeItemById(id, callback);
};

ContentDirectoryService.prototype.processRequest = function(request, response,
    path, callback) {

  this._lastRequestDate = Date.now();

  var contentPath = this.contentPath;

  var self = this;
  if (path.indexOf(contentPath) === 0) {
    var parameters = url.parse(request.url, true).query;
    var p = path.substring(contentPath.length);

    var id = parseInt(p, 10);

    logger.debug("Request resourceId=", id, "parameters=", parameters,
        " request=", path);

    return this.getNodeById(id, function(error, item) {
      if (error) {
        return callback(error);
      }

      if (!item || !item.id) {
        logger.error("SendItem itemId=", id, " not found");

        response.writeHead(404, 'Resource not found: ' + id);
        response.end();
        return callback(null, true);
      }

      return self.processNodeRequest(item, request, response, path, parameters,
          callback);
    });
  }

  if (path === "/tree") {
    return this.getNodeById(0, function(error, item) {
      if (error) {
        return callback(error);
      }
      item.treeString(function(error, string) {
        if (error) {
          return callback(error);
        }

        response.setHeader("Content-Type", "text/plain; charset=\"utf-8\"");
        response.end(string, "UTF8");
        callback(null, true);
      });
    });
  }

  return Service.prototype.processRequest.apply(this, arguments);
};

ContentDirectoryService.prototype.processNodeRequest = function(item, request,
    response, path, parameters, callback) {

  // logger.debug("Request item=", item);
  var itemClass = ContentDirectoryService._itemClasses[item.upnpClass];
  assert(itemClass, "Item class is not defined for " + item.upnpClass);

  return itemClass.processRequest(item, request, response, path, parameters,
      callback);

};

ContentDirectoryService.prototype._garbageItems = function() {
  if (!this._lastRequestDate) {
    return;
  }

  console.log("Try garbage !");

  var now = Date.now();
  if (now < this._lastRequestDate + GARBAGE_DELAY_MS) {
    return;
  }

  console.log("Start garbage !");

  this._lastRequestDate = now;

  this._garbaging = true;

  var self = this;
  this.root.garbage(function(error) {

    console.log("Garbage done !");

    self._garbaging = false;
  });
};

ContentDirectoryService.prototype._sendItemChangesEvent = function() {
  if (this._previousSystemUpdateId == this.systemUpdateId) {
    // return; // We must always send message !
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
    // Send message even empty

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