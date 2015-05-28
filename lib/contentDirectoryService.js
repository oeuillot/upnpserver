/*jslint node: true, vars: true, nomen: true */
"use strict";

var Util = require('util');
var Path = require('path');
var url = require('url');
var assert = require('assert');

var debugFactory = require('debug');
var debug = debugFactory('upnpserver:contentDirectoryService');
var debugDIDL = debugFactory('upnpserver:contentDirectoryService:didl');
var debugGarbage = debugFactory('upnpserver:garbage');

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
var UpnpContainer = require('./class/object.container');

var FileContentProvider = require('./contentProviders/file');

var CONTENT_PATH = "/content/";

var GARBAGE_DELAY_MS = 1000 * 6; // 60 * 60;

var ContentDirectoryService = function(configuration) {
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

  this._childrenWeakHashmap = new NodeWeakHashmap("childrenList", 1000, true);
  this.repositories = [];
  this.systemUpdateId = 0;
  this._previousSystemUpdateId = -1;
  this.updateIds = {};
  this.contentPath = CONTENT_PATH;

  this._fileContentProvider = new FileContentProvider();

  this.upnpClasses = configuration.upnpClasses;
  var contentHandlers = configuration.contentHandlers;
  this.contentHandlersById = contentHandlers;
  this.contentProviders = configuration.contentProviders;

  this.contentHandlersByMimeType = {};
  _setupContentHandlerMimeTypes(this.contentHandlersByMimeType, contentHandlers);

  this.upnpClassesByMimeType = {};
  _setupContentHandlerMimeTypes(this.upnpClassesByMimeType, this.upnpClasses,
      false);
};

function _setupContentHandlerMimeTypes(cht, handlers, mergeWildcard) {
  for ( var key in handlers) {
    var handler = handlers[key];
    var mimeTypes = handler.mimeTypes;
    if (!mimeTypes) {
      continue;
    }

    mimeTypes.forEach(function(mimeType) {
      var cmt = cht[mimeType];
      if (!cmt) {
        cmt = [];
        cht[mimeType] = cmt;
      }

      cmt.push(handler);
    });
  }

  if (mergeWildcard !== false) {
    for ( var mimeType2 in cht) {
      var mts = mimeType2.split('/');
      if (mts[1] === '*') {
        continue;
      }

      var mimeType3 = mts[0] + "/*";
      var ls = cht[mimeType3];
      if (!ls) {
        continue;
      }

      cht[mimeType2] = cht[mimeType2].concat(ls);
    }
  }

  for ( var mimeType4 in cht) {
    var mts2 = cht[mimeType4];

    mts2.sort(function(ch1, ch2) {
      var p1 = ch1.priority || 0;
      var p2 = ch2.priority || 0;

      return p2 - p1;
    });
  }

  if (debug.enabled) {
    for ( var mimeType5 in cht) {
      debug("Handler Mime '" + mimeType5 + "' => " + cht[mimeType5]);
    }
  }
}

function _setupUpnpClassesMimeTypes() {

}

Util.inherits(ContentDirectoryService, Service);

module.exports = ContentDirectoryService;

ContentDirectoryService.prototype.initialize = function(upnpServer, callback) {

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

    self.createNode("root", UpnpContainer.UPNP_CLASS, {
      searchable : false,
      restricted : true,
      title : i18n.ROOT_NAME,
      metadatas : [ {
        name : "upnp:writeStatus",
        content : "NOT_WRITABLE"
      } ]
    }, function(error, node) {
      if (error) {
        return callback(error);
      }

      node.path = "/";
      node.id = 0;
      node.parentId = -1;

      self.registerNode(node, function() {

        self.root = node;

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

      self.newNode(parentItem, segment, UpnpContainer.UPNP_CLASS, {
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
      SearchCaps : ""
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
      SortCaps : [ "dc:title", "upnp:genre", "upnp:artist", "upnp:author",
          "upnp:album", "upnp:rating" ].join(',')
    // TODO "dc:title", "upnp:genre", "upnp:artist", "upnp:author", "upnp:album", "upnp:rating", "res@duration", "res@size" ]
    }
  }, callback);
};

ContentDirectoryService.prototype._prepareAttributesFilter = function(
    filterExpression) {
  if (!filterExpression || filterExpression == "*") {
    return null;
  }

  var validExp = {
    "upnp:class" : true,
    "dc:title" : true,
    "item@id" : true,
    "item@parentID" : true,
    "item@refID" : true,
    "item@restricted" : true,
    "container@id" : true,
    "container@parentID" : true,
    "container@refID" : true,
    "container@restricted" : true
  };

  filterExpression.split(',').forEach(function(token) {
    validExp[token] = true;
  });

  // console.log("Valid exps=", validExp);

  function validAtts(tag) {
    if (!tag._attrs) {
      return false;
    }
    var found = false;
    for ( var att in tag._attrs) {
      if (validExp["@" + att] || validExp["*@" + att]) {
        found = true;
        continue;
      }
      if (validExp[tag._name + "@" + att]) {
        found = true;
        continue;
      }

      delete tag._attrs[att];
    }

    return found;
  }

  return function(xml) {

    validAtts(xml);

    var content = xml._content;
    if (content) {
      for (var i = 0; i < content.length;) {
        var tag = content[i];
        if (validExp[tag._name] || validExp[tag._name + "@*"]) {
          i++;
          continue;
        }

        if (validAtts(tag)) {
          i++;
          continue;
        }

        content.splice(i, 1);
      }
    }

    return xml;
  };
};

ContentDirectoryService.prototype.processSoap_Browse = function(xml, request,
    response, callback) {

  function childNamed(name) {
    return Service._childNamed(xml, name);
  }

  var browseFlag = null;
  var node = childNamed("BrowseFlag");
  if (node) {
    browseFlag = node.val;
  }

  var attributesFilter = null;
  node = childNamed("Filter");
  if (node && node.val) {
    var fs = node.val;

    attributesFilter = this._prepareAttributesFilter(node.val);
  }

  var objectId = this.root.id;
  node = childNamed("ObjectID");
  if (node) {
    objectId = parseInt(node.val, 10);
  }

  if (debug.enabled) {
    debug("CDS: Browse starting  (flags=" + browseFlag + ") of item " +
        objectId);
  }

  var startingIndex = -1;
  node = childNamed("StartingIndex");
  if (node) {
    startingIndex = parseInt(node.val, 10);
  }

  var requestedCount = -1;
  node = childNamed("RequestedCount");
  if (node) {
    requestedCount = parseInt(node.val, 10);
  }

  var sortCriteria = null;
  node = childNamed("SortCriteria");
  if (node) {
    sortCriteria = node.val;
  }

  if (browseFlag === "BrowseMetadata") {
    return this.responseObject(response, request, objectId, attributesFilter,
        callback);
  }

  if (browseFlag === "BrowseDirectChildren") {
    return this
        .responseContainer(response, request, objectId, attributesFilter,
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
    if (debug.enabled) {
      debug("CDS: BrowseObject itemId=", item.id, " error=", error);
    }

    var localhost = request.myHostname;
    var localport = request.socket.localPort;

    var repositoryRequest = {
      contentURL : "http://" + localhost + ":" + localport + self.contentPath,
      request : request,
      contentDirectoryService : self,
      dlnaSupport : self.dlnaSupport
    };

    function produceDidl(item, itemXML) {
      if (filter) {
        itemXML = filter(itemXML);
      }

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

      if (debugDIDL.enabled) {
        debugDIDL("BrowseObject didl=", didl);
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
          UpdateID : (item.id) ? item.updateId : self.systemUpdateId
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

  var self = this;

  var refID = node.refID;
  if (refID) {
    node.resolveLink(function(error, refNode) {
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

  var itemClass = node.upnpClass;

  itemClass.toJXML(node, repositoryRequest, function(error, itemJXML) {
    if (error) {
      return callback(error);
    }

    return callback(null, itemJXML);
  });
};

ContentDirectoryService.prototype.responseContainer = function(response,
    request, containerId, attributesFilter, startingIndex, requestedCount,
    sortCriteria, callback) {

  if (debug.enabled) {
    debug("Request containerId=" + containerId + " attributesFilter=" +
        !!attributesFilter + " startingIndex=" + startingIndex +
        " requestedCount=" + requestedCount + " sortCriteria=" + sortCriteria);
  }

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

            function processList(list, node) {

              var lxml = [];

              var xmlDidl = {
                _name : "DIDL-Lite",
                _attrs : {
                  "xmlns" : "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
                  "xmlns:dc" : "http://purl.org/dc/elements/1.1/",
                  "xmlns:upnp" : "urn:schemas-upnp-org:metadata-1-0/upnp/"
                }
              };

              var localhost = request.myHostname;
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

              Async.eachSeries(list, function(child, callback) {
                if (!child) {
                  logger.warn("ALERT not a node ", child);
                  return callback(null, list);
                }

                self.getNodeJXML(child, repositoryRequest, function(error,
                    itemJXML) {
                  if (error) {
                    return callback(error);
                  }

                  lxml.push(itemJXML);
                  setImmediate(callback);
                });

              }, function(error) {
                if (error) {
                  return callback(error);
                }

                // if (filter) {
                // // We can apply filters HERE
                // }

                if (sortCriteria) {
                  sortCriteria = sortCriteria.split(',');
                }

                sortCriteria = sortCriteria || node.attributes.defaultSort ||
                    node.upnpClass.defaultSort;

                // console.log("Sort criteria = ", sortCriteria, " upnpClass=", node.upnpClass);

                var sortFunction = null;
                for (var i = 0; i < sortCriteria.length; i++) {
                  var c = sortCriteria[i].trim();

                  var descending = (c.charAt(0) === '-');

                  sortFunction = _createSortCriteria(sortFunction, c
                      .substring(1), descending);
                }

                lxml.sort(sortFunction);

                var total = lxml.length;

                if (startingIndex > 0) {
                  if (startingIndex > lxml.length) {
                    lxml = [];
                  } else {
                    lxml = lxml.slice(startingIndex);
                  }
                }
                if (requestedCount > 0) {
                  lxml = lxml.slice(0, requestedCount);
                }

                if (attributesFilter) {
                  lxml.forEach(function(x) {
                    attributesFilter(x);
                  });
                }

                xmlDidl._content = lxml;

                var didl = jstoxml.toXML(xmlDidl, {
                  header : false,
                  indent : "",
                  filter : xmlFilters
                });

                if (debugDIDL.enabled) {
                  debugDIDL("BrowseContainer didl=", didl);
                }

                self.responseSoap(response, "Browse", {
                  _name : "u:BrowseResponse",
                  _attrs : {
                    "xmlns:u" : self.type
                  },
                  _content : {
                    Result : didl,
                    NumberReturned : lxml.length,
                    TotalMatches : total,
                    UpdateID : (node.id) ? node.updateId : self.systemUpdateId
                  }
                }, function(error) {
                  if (error) {
                    return callback(error);
                  }

                  if (debug.enabled) {
                    debug("CDS: Browse end " + containerId);
                  }
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

                  return processList(list, refItem);
                });

              });
              return;
            }

            if (debug.enabled) {
              debug("CDS: Browser itemId=", item.id, " error=", error);
            }

            item.listChildren(function(error, list) {
              if (error) {
                logger.warn("Can not scan repositories: ", error);
                return callback(error);
              }

              return processList(list, item);
            });
          });
};

function _createSortCriteria(func, criteria, descending) {
  return function(x1, x2) {
    if (func) {
      var ret = func(x1, x2);
      if (ret) {
        return ret;
      }
    }

    var n1 = _getNodeContent(x1, criteria, descending);
    var n2 = _getNodeContent(x2, criteria, descending);

    if (n1 < n2) {
      return (descending) ? 1 : -1;
    }
    if (n1 > n2) {
      return (descending) ? -1 : 1;
    }

    return 0;
  };
}

ContentDirectoryService.prototype.browseNode = function(node, callback) {
  var path = node.getPath();

  if (debug.enabled) {
    debug("CDS: browseNode nodeID=" + node.id + " path='" + path +
        "' repositories.count=" + this.repositories.length);
  }

  var list = [];
  Async.each(this.repositories, function(repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {
      if (debug.enabled) {
        debug("CDS: browseNode repository mountPath=" + repository.mountPath +
            " path=" + path + " is not in mountpath");
      }
      return callback();
    }

    if (debug.enabled) {
      debug("CDS: browseNode repository mountPath=" + repository.mountPath);
    }

    repository.browse(list, node, function(error, result) {
      if (error) {
        logger.error("CDS: browseNode repository mountPath=" +
            repository.mountPath + " error ", error);
        return callback(error);
      }

      if (!result || !result.length) {
        if (debug.enabled) {
          debug("CDS: browseNode repository mountPath=" + repository.mountPath +
              " => No result list=" + list.length);
        }
        return callback();
      }

      if (debug.enabled) {
        debug("CDS: browseNode repository mountPath=" + repository.mountPath +
            " => " + result.length, " list=" + list.length);
      }

      // logger.debug("Browse => " + result);

      list = list.concat(result);
      callback();
    });

  }, function(error) {
    if (error) {
      logger.error("CDS: browseNode '" + path + "' returns error ", error);
      return callback(error);
    }

    if (debug.enabled) {
      debug("CDS: browseNode '" + path + "' returns " + list.length +
          " elements.");
    }

    return callback(null, list);
  });
};

ContentDirectoryService.prototype.createNodeRef = function(targetNode, name,
    callback) {

  if (name === targetNode.name) {
    // no need to have a name if the referenced has the same !
    name = undefined;
  }

  var node = Node.createRef(targetNode, name);

  return callback(null, node);
};

ContentDirectoryService.prototype.createNode = function(name, upnpClass,
    attributes, callback) {

  if (typeof (callback) !== "function") {
    throw new Error("Invalid callback parameter");
  }

  if (!upnpClass) {
    throw new Error("No upnpClass specified for '" + name + "'");
  }

  if (typeof (upnpClass) === "string") {
    var uc = this.upnpClasses[upnpClass];
    assert(uc, "Item class is not defined for " + upnpClass);

    upnpClass = uc;
  }
  assert(upnpClass instanceof UpnpItem, "Upnpclass must be an item (name=" +
      name + " upnpClass=" + upnpClass + ")");

  var node = Node.create(this, name, upnpClass, attributes);

  // console.log("Node created=", node);
  var self = this;

  upnpClass.prepareNode(node, function(error) {
    if (error) {
      return callback(error);
    }

    return callback(null, node);
  });
};

ContentDirectoryService.prototype.newNodeRef = function(parent, targetNode,
    name, before, callback) {

  if (arguments.length === 4 && typeof (before) === "function") {
    callback = before;
    before = null;
  }

  var self = this;
  this.createNodeRef(targetNode, name, function(error, node) {
    if (error) {
      return callback(error);
    }

    parent.insertBefore(node, before, function(error) {
      if (error) {
        logger.error("Append child error=", error);
        return callback(error);
      }

      return callback(null, node, node.id);
    });
  });
};

ContentDirectoryService.prototype.newNode = function(parentNode, name,
    upnpClass, attributes, before, callback) {

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = attributes;
    attributes = undefined;
    break;
  case 5:
    callback = before;
    before = undefined;
    break;
  }

  assert(parentNode instanceof Node, "Invalid parentNode parameter");
  assert(typeof (name) === "string", "Invalid contentURL parameter");
  assert(typeof (callback) === "function", "Invalid callback parameter");

  attributes = attributes || {};

  upnpClass = upnpClass || UpnpItem.UPNP_CLASS;

  var self = this;
  this.createNode(name, upnpClass, attributes, function(error, node) {
    if (error) {
      return callback(error);
    }

    parentNode.insertBefore(node, before, function(error) {
      if (error) {
        logger.error("Append child error=", error);
        return callback(error);
      }

      return callback(null, node, node.id);
    });
  });
};

ContentDirectoryService.prototype.registerUpdate = function(node) {
  this.systemUpdateId++;
  this.updateIds[node.id] = node.updateId;
};

ContentDirectoryService.prototype.updateItem = function(item, callback) {
  // Il faut identifier le repository associé à cet item

  var path = item.getPath();

  logger.debug("CDS: updateItem itemID=" + item.id + " path='" + path +
      "' repositories.count=" + this.repositories.length);

  Async.each(this.repositories, function(repository, callback) {

    if (path.indexOf(repository.mountPath) !== 0) {
      if (debug.enabled) {
        debug("CDS: browseNode repository mountPath=" + repository.mountPath +
            " path is not in mountpath");
      }
      return callback(null);
    }

    if (debug.enabled) {
      debug("CDS: updateItem repository mountPath=" + repository.mountPath);
    }

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

    if (debug.enabled) {
      debug("CDS: updateItem '" + path + "'.");
    }

    return callback(null);
  });
};

ContentDirectoryService.prototype.registerNode = function(item, callback) {
  this._nodeRegistry.registerNode(item, callback);
};

ContentDirectoryService.prototype.getNodeById = function(id, callback) {
  this._nodeRegistry.getNodeById(id, callback);
};

ContentDirectoryService.prototype.unregisterNodeById = function(id, callback) {
  this._nodeRegistry.unregisterNodeById(id, callback);
};

ContentDirectoryService.prototype.processRequest = function(request, response,
    path, callback) {

  this._lastRequestDate = Date.now();
  request.contentDirectoryService = this;

  var contentPath = this.contentPath;

  var self = this;
  if (path.indexOf(contentPath) === 0) {
    var parameters = url.parse(request.url, true).query;
    var p = path.substring(contentPath.length);

    var id = parseInt(p, 10);

    if (debug.enabled) {
      debug("Request resourceId=", id, "parameters=", parameters, " request=",
          path);
    }

    return this.getNodeById(id, function(error, node) {
      if (error) {
        return callback(error);
      }

      if (!node || !node.id) {
        logger.error("SendItem itemId=", id, " not found");

        response.writeHead(404, 'Resource not found: ' + id);
        response.end();
        return callback(null, true);
      }

      node.resolveLink(function(error, nodeRef) {
        self.processNodeRequest(nodeRef, request, response, path, parameters,
            callback);
      });
    });
  }

  if (path === "/tree") {
    return this.getNodeById(0, function(error, node) {
      if (error) {
        return callback(error);
      }
      node.treeString(function(error, string) {
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
  var itemClass = item.upnpClass;
  assert(itemClass, "Item upnpclass is not defined for node " + item.id);

  assert(itemClass.processRequest, "No processRequest for upnpclass " +
      itemClass);

  return itemClass.processRequest(item, request, response, path, parameters,
      callback);

};

ContentDirectoryService.prototype._garbageItems = function() {
  if (!this._lastRequestDate) {
    return;
  }

  debugGarbage("Try garbage !");

  var now = Date.now();
  if (now < this._lastRequestDate + GARBAGE_DELAY_MS) {
    return;
  }

  debugGarbage("Start garbage !");

  this._lastRequestDate = now;

  this._garbaging = true;

  var self = this;
  this.root.garbage(function(error) {

    debugGarbage("Garbage done !");

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
      "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
      "xmlns:s" : this.type
    },
    _content : xmlContent
  };

  this.sendEvent("upnp:propchange", xmlContent);
};

ContentDirectoryService.prototype.processSoap_Search = function(xml, request,
    response, callback) {

  callback();
};

ContentDirectoryService.prototype.getContentProvider = function(url) {
  return this._fileContentProvider;
};

function _getNodeContent(node, name, descending) {
  var contents = node._content;
  var found;

  for (var i = 0; i < contents.length; i++) {
    var content = contents[i];
    if (content._name !== name) {
      continue;
    }

    var c = content._content;

    if (found === undefined) {
      found = c;
      continue;
    }

    if ((!descending && found < c) || (descending && found > c)) {
      continue;
    }

    found = c;
  }

  // console.log("Can not get node '" + name + "' of ", node);

  return found || "";
}
