/*jslint node: true, vars: true, nomen: true */
"use strict";

var Util = require('util');
var Path = require('path');
var url = require('url');
var assert = require('assert');
var _ = require('underscore');

var debugFactory = require('debug');
var debug = debugFactory('upnpserver:contentDirectoryService');
var debugDIDL = debugFactory('upnpserver:contentDirectoryService:didl');
var debugGarbage = debugFactory('upnpserver:garbage');
var debugWorker = debugFactory('upnpserver:worker');
var debugStack = debugFactory('upnpserver:stack');

var Async = require("async");
var Mime = require('mime');
var jstoxml = require('jstoxml');
var send = require('send');

var logger = require('./logger');
var Service = require("./service");
var Node;
var NodeWeakHashmap = require('./nodeWeakHashmap');
var xmlFilters = require("./xmlFilters").xmlFilters;

var UpnpItem = require('./class/object.item');
var UpnpContainer = require('./class/object.container');

var FileContentProvider = require('./contentProviders/file');

var CONTENT_PATH = "/content/";

var PREPARING_QUEUE_LIMIT = 4;

var GARBAGE_DELAY_MS = 1000 * 6; // 60 * 60;

var ContentDirectoryService = function(configuration) {

  Node = require('./node');

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
  // TODO: better event definition (moderated rate)
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

  this.jasminFileMetadatasExtension = (configuration.jasminFileExtesion === true);
  this.jasminMusicMetadatasExtension = (configuration.jasminMusicExtesion === true);

  this._childrenWeakHashmap = new NodeWeakHashmap("childrenList", 1000, true);
  this.repositories = [];
  this.systemUpdateId = 0;
  this._previousSystemUpdateId = -1;
  this.updateIds = {};
  this.contentPath = CONTENT_PATH;

  this._preparingQueue = Async.priorityQueue(this._preparingNodeWorker
      .bind(this), PREPARING_QUEUE_LIMIT);

  this._fileContentProvider = new FileContentProvider();

  this.upnpClasses = configuration.upnpClasses;
  this.contentHandlers = configuration.contentHandlers;
  this.contentProviders = configuration.contentProviders;
  this.contentHandlersById = {};

  this.upnpClassesByMimeType = {};
  _setupContentHandlerMimeTypes(this.upnpClassesByMimeType, this.upnpClasses,
      false);
};

Util.inherits(ContentDirectoryService, Service);

module.exports = ContentDirectoryService;

ContentDirectoryService.LOW_PRIORITY = 100;
ContentDirectoryService.MED_PRIORITY = 50;
ContentDirectoryService.SYNC_PRIORITY = 0;

ContentDirectoryService.DLNA_DEVICE_XMLNS = "urn:schemas-dlna-org:device-1-0";
ContentDirectoryService.UPNP_CONTENT_DIRECTORY_1_XMLNS = "urn:schemas-upnp-org:service:ContentDirectory:1";
ContentDirectoryService.DIDL_LITE_XMLNS = "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/";
ContentDirectoryService.PURL_ELEMENT_XMLS = "http://purl.org/dc/elements/1.1/";

ContentDirectoryService.JASMIN_FILEMETADATA_XMLNS = "urn:schemas-jasmin-upnp.net:filemetadata/";
ContentDirectoryService.JASMIN_MUSICMETADATA_XMLNS = "urn:schemas-jasmin-upnp.net:musicmetadata/";

function _stackDepth() {
  return new Error().stack.split("\n").length - 1;
}
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

ContentDirectoryService.prototype.initialize = function(upnpServer, callback) {

  this.dlnaSupport = upnpServer.dlnaSupport;

  var self = this;
  Service.prototype.initialize.call(this, upnpServer, function(error) {
    if (error) {
      return callback(error);
    }

    Async.eachSeries(self.contentHandlers, function(contentHandler, callback) {

      self.contentHandlersById[contentHandler.key] = contentHandler;

      contentHandler.initialize(self, callback);

    }, function(error) {
      if (error) {
        console.error(error);

        return callback(error);
      }

      self._installRoot(function(error, root) {
        if (error) {
          return callback(error);
        }

        var repositories = upnpServer.configuration.repositories;

        return self.addRepositories(repositories, function(error) {
          if (error) {
            return callback(error);
          }
          // TOO BAAAAD !!!
          self._intervalTimer = setInterval(function() {
            self._sendItemChangesEvent();
          }, 1500);

          if (upnpServer.configuration.garbageItems) {
            debug("Garbage items is enabled !");

            self._intervalGarbage = setInterval(function() {
              self._garbageItems();
            }, Math.floor(GARBAGE_DELAY_MS / 10));

            self._lastRequestDate = Date.now();
          }

          callback(null);
        });
      });
    });
  });
};

ContentDirectoryService.prototype._installRoot = function(callback) {
  if (this.root) {
    return callback(null, this.root);
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

      self.registerNode(node, function(error) {
        if (error) {
          return callback(error);
        }

        self.root = node;

        callback(null, node);
      });
    });
  });
};

ContentDirectoryService.prototype.addRepositories = function(repositories,
    callback) {

  if (!repositories || !repositories.length) {
    return callback("no repositories");
  }

  repositories = repositories.slice(0); // clone
  repositories.sort(function(r1, r2) {
    return r1.mountPath.length - r2.mountPath.length;
  });

  debug("Adding ", repositories.length, " repositories");

  var self = this;
  Async.eachSeries(repositories, function(repository, callback) {

    debug("Adding repository", repository.mountPath);

    self.addRepository(repository, callback);

  }, callback);
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

  this._installRoot(function(error, root) {
    repository.initialize(self, function(error) {
      if (error) {
        return callback(error);
      }

      self.repositories.push(repository);
      callback(null, repository);
    });
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
      "xmlns:u" : this.type,
      "xmlns:upnp" : Service.UPNP_METADATA_XMLNS,
      "xmlns:dc" : ContentDirectoryService.PURL_ELEMENT_XMLS
    },
    _content : {
      SortCaps : [ "dc:title", "upnp:genre", "upnp:artist", "upnp:author",
          "upnp:album", "upnp:rating" ].join(',')
    // TODO "dc:title", "upnp:genre", "upnp:artist", "upnp:author", "upnp:album", "upnp:rating", "res@duration", "res@size" ]
    }
  }, callback);
};

var _splitXmlnsNameRegExp = /([a-z0-9_-]+):(.*)$/i;

ContentDirectoryService.prototype._prepareAttributesFilter = function(
    filterExpression, namespaceURIs) {
  if (!filterExpression || filterExpression == "*") {
    return null;
  }

  var xmlns = {};
  xmlns[ContentDirectoryService.DIDL_LITE_XMLNS] = "";
  xmlns[Service.UPNP_METADATA_XMLNS] = "upnp";
  xmlns[ContentDirectoryService.PURL_ELEMENT_XMLS] = "dc";

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
    "container@restricted" : true,
    "container@childCount" : true
  };

  filterExpression.split(',').forEach(function(token) {
    var sp = _splitXmlnsNameRegExp.exec(token);
    if (!sp) {
      validExp[token] = true;
      return;
    }

    var prefixXmlns = namespaceURIs[sp[1]];
    var newPrefix = xmlns[prefixXmlns];
    if (newPrefix === undefined) {
      console.error("Unknown prefix for", prefixXmlns, sp, namespaceURIs);
      return;
    }

    var newToken = newPrefix + (newPrefix ? ':' : '') + sp[2];

    // console.log("Valid token " + newToken);
    validExp[newToken] = true;
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

ContentDirectoryService.prototype.processSoap_Search = function(xml, request,
    response, callback) {

  function childNamed(name, xmlns) {
    var node = Service._childNamed(xml, name, xmlns);
    return node;
  }

  var objectId = this.root.id;
  var node = childNamed("ContainerID", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    objectId = node.val;
  }

  var searchCriteria = null;
  node = childNamed("SearchCriteria", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    searchCriteria = node.val;
  }

  var attributesFilter = null;
  node = childNamed("Filter", Service.UPNP_SERVICE_XMLNS);
  if (node && node.val) {
    var fs = node.val;
    // console.log(Util.inspect(node));
    attributesFilter = this._prepareAttributesFilter(node.val,
        node.namespaceURIs);
  }

  var startingIndex = -1;
  node = childNamed("StartingIndex", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    startingIndex = parseInt(node.val, 10);
  }

  var requestedCount = -1;
  node = childNamed("RequestedCount", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    requestedCount = parseInt(node.val, 10);
  }

  var sortCriteria = null;
  node = childNamed("SortCriteria", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    sortCriteria = node.val;
  }

  debug("CDS: Search sortCriteria:" + sortCriteria + " requestedCount:" +
      requestedCount + " ContainerID:" + objectId + " startingIndex:" +
      startingIndex);

  return this.responseSeach(response, request, objectId, attributesFilter,
      startingIndex, requestedCount, sortCriteria, searchCriteria, callback);
};

ContentDirectoryService.prototype.responseSeach = function(response, request,
    containerId, attributesFilter, startingIndex, requestedCount, sortCriteria,
    searchCriteria, callback) {

  debug("Request containerId=" + containerId + " attributesFilter=" +
      !!attributesFilter + " startingIndex=" + startingIndex +
      " requestedCount=" + requestedCount + " sortCriteria=" + sortCriteria);

  var self = this;
  this
      .getNodeById(
          containerId,
          function(error, item) {

            if (error) {
              logger.error("CDS: Can not getNodeById for id", containerId);
              return callback(501, error);
            }
            if (!item) {
              return callback(710, "CDS: Browser Can not find item " +
                  containerId);
            }

            self.emit("Search", request, item);

            function processList(list, node) {

              self.emit("filterList", request, node, list);

              var lxml = [];

              var xmlDidl = {
                _name : "DIDL-Lite",
                _attrs : {
                  "xmlns" : ContentDirectoryService.DIDL_LITE_XMLNS,
                  "xmlns:dc" : ContentDirectoryService.PURL_ELEMENT_XMLS,
                  "xmlns:upnp" : Service.UPNP_METADATA_XMLNS
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

                self.getNodeJXML(child, null, repositoryRequest, function(
                    error, itemJXML) {
                  if (error) {
                    return callback(error);
                  }

                  lxml.push(itemJXML);
                  setImmediate(callback);
                });

              }, function(error) {
                if (error) {
                  return callback(501, error);
                }

                if (attributesFilter) {
                  attributesFilter(lxml);
                }

                sortCriteria = sortCriteria || node.attributes.defaultSort ||
                    node.upnpClass.defaultSort;
                if (sortCriteria) {
                  _applySortCriteria(lxml, sortCriteria);
                }

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

                debugDIDL("SearchContainer didl=", didl);

                self.responseSoap(response, "Search", {
                  _name : "u:SearchResponse",
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
                    return callback(501, error);
                  }

                  debug("CDS: Search end " + containerId);

                  callback(null);
                });
              });
            }

            function filter(node) {
              return true;
            }

            if (item.refID) {
              self.getNodeById(item.refID, function(error, refItem) {

                if (error) {
                  logger.error("CDS: Can not getNodeById for REF id",
                      item.refID);
                  return callback(701, error);
                }
                if (!refItem) {
                  return callback(701, "CDS: Browser Can not find REF item " +
                      item.refID);
                }

                refItem.filterChildNodes(refItem, null, filter, function(error,
                    list) {
                  if (error) {
                    logger.warn("Can not scan repositories: ", error);
                    return callback(710, error);
                  }
                  return processList(list, item);
                });

              });
              return;
            }

            debug("CDS: Browser itemId=", item.id, " error=", error);

            item.filterChildNodes(item, null, filter, function(error, list) {
              if (error) {
                logger.warn("Can not scan repositories: ", error);
                return callback(710, error);
              }
              return processList(list, item);
            });
          });
};

ContentDirectoryService.prototype.processSoap_Browse = function(xml, request,
    response, callback) {

  function childNamed(name, xmlns) {
    var node = Service._childNamed(xml, name, xmlns);

    return node;
  }

  var searchCriteria = null;
  var node = childNamed("SearchCriteria", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    searchCriteria = node.val;
  }

  var browseFlag = null;
  node = childNamed("BrowseFlag", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    browseFlag = node.val;
  }

  var attributesFilter = null;
  node = childNamed("Filter", Service.UPNP_SERVICE_XMLNS);
  if (node && node.val) {
    var fs = node.val;

    attributesFilter = this._prepareAttributesFilter(node.val,
        node.namespaceURIs);
  }

  var objectId = this.root.id;
  node = childNamed("ObjectID", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    objectId = parseInt(node.val, 10);
  }

  if (debug.enabled) {
    debug("CDS: Browse starting  (flags=" + browseFlag + ") of item " +
        objectId);
  }

  var startingIndex = -1;
  node = childNamed("StartingIndex", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    startingIndex = parseInt(node.val, 10);
  }

  var requestedCount = -1;
  node = childNamed("RequestedCount", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    requestedCount = parseInt(node.val, 10);
  }

  var sortCriteria = null;
  node = childNamed("SortCriteria", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    sortCriteria = node.val;
  }
  debug("CDS: Browse sortCriteria:" + sortCriteria + " browseFlag:" +
      browseFlag + " requestedCount:" + requestedCount + " objectId:" +
      objectId + " startingIndex:" + startingIndex);

  if (browseFlag === "BrowseMetadata") {
    return this.processBrowseMetadata(response, request, objectId,
        attributesFilter, callback);
  }

  if (browseFlag === "BrowseDirectChildren") {
    return this.processBrowseDirectChildren(response, request, objectId,
        attributesFilter, startingIndex, requestedCount, sortCriteria,
        searchCriteria, callback);
  }

  callback("Unknown browseFlag '" + browseFlag + "'");
};

ContentDirectoryService.prototype.processBrowseMetadata = function(response,
    request, objectId, filter, callback) {

  logger.info("Request ObjectId=" + objectId);

  var self = this;
  this.getNodeById(objectId, function(error, node) {

    if (error) {

      return callback(701, error);
    }
    if (!node) {
      return callback(701, "CDS: BrowseObject Can not find node " + objectId);
    }
    if (debug.enabled) {
      debug("CDS: BrowseObject node=#", node.id, " error=", error);
    }

    self.emit("BrowseMetadata", request, node);

    var localhost = request.myHostname;
    var localport = request.socket.localPort;

    var repositoryRequest = {
      contentURL : "http://" + localhost + ":" + localport + self.contentPath,
      request : request,
      contentDirectoryService : self,
      dlnaSupport : self.dlnaSupport
    };

    function produceDidl(node, nodeXML) {
      if (filter) {
        nodeXML = filter(nodeXML);
      }

      var xmlDidl = {
        _name : "DIDL-Lite",
        _attrs : {
          "xmlns" : ContentDirectoryService.DIDL_LITE_XMLNS,
          "xmlns:dc" : ContentDirectoryService.PURL_ELEMENT_XMLS,
          "xmlns:upnp" : Service.UPNP_METADATA_XMLNS
        },
        _content : nodeXML
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
          UpdateID : (node.id) ? node.updateId : self.systemUpdateId
        }
      }, function(code, error) {
        if (error) {
          return callback(code, error);
        }

        // logger.debug("CDS: Browse end " + containerId);
        callback(null);
      });
    }

    self.getNodeJXML(node, null, repositoryRequest, function(error, nodeJXML) {
      if (error) {
        return callback(500, error);
      }

      return produceDidl(node, nodeJXML, callback);
    });
  });
};

ContentDirectoryService.prototype.getNodeJXML = function(node,
    inheritedAttributes, repositoryRequest, callback) {

  var self = this;

  var refID = node.refID;
  if (refID) {
    node.resolveLink(function(error, refNode) {
      if (error) {
        return callback(error);
      }

      var linkAttributes = node.attributes;

      self.getNodeJXML(refNode, linkAttributes, repositoryRequest, function(
          error, refNodeJXML) {
        if (error) {
          return callback(error);
        }

        refNodeJXML._attrs.id = node.id;
        refNodeJXML._attrs.refID = refNode.id;
        refNodeJXML._attrs.parentID = node.parentId;

        return callback(null, refNodeJXML);
      });
    });
    return;
  }

  var itemClass = node.upnpClass;

  this.prepareNodeAttributes(node, ContentDirectoryService.SYNC_PRIORITY,
      function(error, node) {
        if (error) {
          return callback(error);
        }

        var attributes = node.attributes;
        if (inheritedAttributes) {
          attributes = _.extend({}, attributes, inheritedAttributes);

          // console.log("Merged attribute of #" + node.id + " ", attributes, "from=", node.attributes, "inherit=",
          // inheritedAttributes);
        }

        itemClass.toJXML(node, attributes, repositoryRequest, function(error,
            itemJXML) {
          if (error) {
            return callback(error);
          }

          return callback(null, itemJXML);
        });
      });
};

ContentDirectoryService.prototype.processBrowseDirectChildren = function(
    response, request, containerId, attributesFilter, startingIndex,
    requestedCount, sortCriteria, searchCriteria, callback) {

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
              return callback(501, error);
            }
            if (!item) {
              return callback(710, "CDS: Browser Can not find item " +
                  containerId);
            }

            self.emit("BrowseDirectChildren", request, item);

            function processList(list, node) {

              self.emit("filterList", request, node, list);

              var lxml = [];

              var xmlDidl = {
                _name : "DIDL-Lite",
                _attrs : {
                  "xmlns" : ContentDirectoryService.DIDL_LITE_XMLNS,
                  "xmlns:dc" : ContentDirectoryService.PURL_ELEMENT_XMLS,
                  "xmlns:upnp" : Service.UPNP_METADATA_XMLNS
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

                self.getNodeJXML(child, null, repositoryRequest, function(
                    error, itemJXML) {
                  if (error) {
                    return callback(error);
                  }

                  lxml.push(itemJXML);
                  setImmediate(callback);
                });

              }, function(error) {
                if (error) {
                  return callback(501, error);
                }

                // if (filter) {
                // // We can apply filters HERE
                // }

                sortCriteria = sortCriteria || node.attributes.defaultSort ||
                    node.upnpClass.defaultSort;
                if (sortCriteria) {
                  _applySortCriteria(lxml, sortCriteria);
                }

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
                    return callback(501, error);
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
                  return callback(701, error);
                }
                if (!refItem) {
                  return callback(701, "CDS: Browser Can not find REF item " +
                      item.refID);
                }

                refItem.listChildren(function(error, list) {
                  if (error) {
                    logger.warn("Can not scan repositories: ", error);
                    return callback(501, error);
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
                return callback(710, error);
              }

              return processList(list, item);
            });
          });
};

function _applySortCriteria(lxml, sortCriteria) {

  if (typeof (sortCriteria) === "string") {
    sortCriteria = sortCriteria.split(',');
  }

  // console.log("Sort criteria = ", sortCriteria, " upnpClass=", node.upnpClass);

  var sortFunction = null;
  for (var i = 0; i < sortCriteria.length; i++) {
    var c = sortCriteria[i].trim();

    var descending = (c.charAt(0) === '-');

    sortFunction = _createSortCriteria(sortFunction, c.substring(1), descending);
  }

  lxml.sort(sortFunction);
}

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

    // console.log("Compare ", n1, "<>", n2, " ", descending);

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

  this.asyncEmit("browse", list, node, function(error) {
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
      debug("newNodeRef: createNodeRef error=", error);
      return callback(error);
    }

    parent.insertBefore(node, before, function(error) {
      if (error) {
        debug("newNodeRef: insertBefore error=", error);
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

ContentDirectoryService.prototype.updateNode = function(node, callback) {
  // Il faut identifier le repository associé à cet item

  var path = node.getPath();
  if (debug.enabled) {
    debug("CDS: updateNode node.id=" + node.id + " path='" + path +
        "' repositories.count=" + this.repositories.length);
  }

  this.asyncEmit("update", node, function(error) {
    if (error) {
      logger.error("CDS: updateNode '" + path + "' returns error ", error);
      return callback(error);
    }

    if (debug.enabled) {
      debug("CDS: updateNode '" + path + "' done");
    }

    return callback();
  });
};

ContentDirectoryService.prototype.registerNode = function(node, callback) {
  var self = this;
  this._nodeRegistry.registerNode(node, function(error) {
    if (error) {
      return callback(error);
    }

    self.asyncEmit('newNode', node, callback);
  });
};

ContentDirectoryService.prototype.getNodeById = function(id, options, callback) {
  if (arguments.length === 2) {
    callback = options;
    options = null;
  }

  var self = this;

  this._nodeRegistry.getNodeById(id, callback);
};

ContentDirectoryService.prototype.unregisterNodeById = function(id, callback) {
  var self = this;
  this.asyncEmit('deleteNode', id, function(error) {
    if (error) {
      return callback(error);
    }
    self._nodeRegistry.unregisterNodeById(id, callback);
  });
};

ContentDirectoryService.prototype.unregisterNode = function(node, callback) {
  this.unregisterNodeById(node.id, callback);
};

ContentDirectoryService.prototype.processRequest = function(request, response,
    path, callback) {

  this._lastRequestDate = Date.now();
  request.contentDirectoryService = this;

  var contentPath = this.contentPath;

  var self = this;
  if (path.indexOf(contentPath) === 0) {
    var p = path.substring(contentPath.length);
    var parameters = url.parse(request.url, true).query;

    var id = parseInt(p, 10);

    if (debug.enabled) {
      debug("processRequest: Request node=", id, "parameters=", parameters,
          "request=", path);
    }

    return this.getNodeById(id, function(error, node) {
      if (error) {
        debug("processRequest: GetNodeById id=", id, " throws error=", error);
        return callback(error);
      }

      if (!node || !node.id) {
        logger.error("Send content of node=", id, "not found");

        self.emit("request-error", request, id);

        response.writeHead(404, 'Node not found #' + id);
        response.end();
        return callback(null, true);
      }

      node.resolveLink(function(error, nodeRef) {

        self.emit("request", request, nodeRef, node, parameters);

        self.processNodeContent(nodeRef, request, response, path, parameters,
            callback);
      });
    });
  }

  if (path === "/tree") {
    return this.getNodeById(0, function(error, node) {
      if (error) {
        debug("/tree get root node returns error", error);
        return callback(error);
      }
      node.treeString(function(error, string) {
        if (error) {
          debug("/tree treeString() returns error", error);
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

ContentDirectoryService.prototype.processNodeContent = function(node, request,
    response, path, parameters, callback) {

  // logger.debug("Request item=", item);
  var upnpClass = node.upnpClass;
  assert(upnpClass, "Node upnpclass is not defined for node " + node.id);

  assert(upnpClass.processRequest, "No processRequest for upnpclass " +
      upnpClass);

  return upnpClass.processRequest(node, request, response, path, parameters,
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
        "xmlns:dt" : Service.MICROSOFT_DATATYPES_XMLNS,
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

  if (messageArray.length) {
    // Why ??? Send message even empty

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
      xmlns : Service.UPNP_SERVICE_XMLNS,
      "xmlns:e" : Service.UPNP_EVENT_XMLNS,
      "xmlns:dt" : Service.MICROSOFT_DATATYPES_XMLNS,
      "xmlns:s" : this.type
    },
    _content : xmlContent
  };

  this.sendEvent("upnp:propchange", xmlContent);
};

ContentDirectoryService.prototype.getContentProvider = function(url) {
  return this._fileContentProvider;
};

function _getNodeContent(node, name, descending) {
  var contents = node._content;
  var found;

  // console.log("Get ", name, descending, " of node ", node);

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

  // console.log("Get node '" + name + "' of ", node, " => ", found);

  return found || "";
}

ContentDirectoryService.prototype.prepareNodeAttributes = function(node,
    options, callback) {
  var self = this;

  if (debugStack.enabled) {
    debugStack("prepareNodeAttributes node=#" + node.id + " depth=" +
        _stackDepth());
  }

  if (node.prepared !== false) {
    if (callback) {
      return callback(null, node);
    }
    return;
  }

  var refID = node.refID;
  if (refID) {
    delete node.prepared;

    node.resolveLink(function(error, refNode) {
      if (error) {
        return callback(error);
      }

      if (refNode.prepared !== false) {
        return callback(null, node);
      }

      self.prepareNodeAttributes(refNode, options, function(error) {
        if (error) {
          return callback(error);
        }

        callback(null, node);
      });
    });
    return;
  }

  if (arguments.length === 2) {
    callback = options;
    options = undefined;
  }

  var priority = ContentDirectoryService.MED_PRIORITY;

  if (options) {
    if (typeof (options) === "number") {
      priority = options;

    } else if (typeof (options.priority) == "number") {
      priority = options.priority;
    }
  }

  if (debugWorker.enabled) {
    debugWorker("PrepareNodeAttributes node #" + node.id + " " + node.prepared +
        "  callback=" + (!!callback) + " priority=" + priority);
  }

  if (callback) {
    var callbackOld = callback;

    callback = function(error) {

      if (false && debugWorker.enabled) {
        debugWorker("PrepareNodeAttributes node #" + node.id + " done error=",
            error);
      }

      setImmediate(callbackOld.bind(self, error, node));
    };
  }

  this._preparingQueue.push(node, priority, callback);
};

ContentDirectoryService.prototype._preparingNodeWorker = function(node,
    callback) {

  if (node.prepared !== false) {
    return callback();
  }

  delete node.prepared;

  if (debugWorker.enabled) {
    debugWorker("PrepareNodeWorker node #" + node.id + " ...");
  }

  if (debugStack.enabled) {
    debugStack("prepareNodeWorker node=#" + node.id + " depth=" + _stackDepth());
  }

  this.emitPrepareNode(node,
      function(error) {
        if (debugWorker.enabled) {
          debugWorker("PrepareNodeWorker node #" + node.id + " done error=",
              error);
        }

        callback(error);
      });
};

ContentDirectoryService.prototype.emitPrepareNode = function(node, callback) {

  var mime = node.attributes.mime;
  if (!mime) {
    setImmediate(callback);
    return;
  }

  var self = this;

  var mainError;

  // console.log("Emit 'prepare:'" + mime+" "+node.attributes.contentURL);
  this.asyncEmit("prepare:" + mime, node, function(error) {
    if (error === false) {
      // setImmediate(callback);
      // return;
    }
    if (error) {
      mainError = error;
      // setImmediate(callback.bind(self, error));
      // return;
    }

    var mime2 = mime.split("/")[0] + "/*";

    // console.log("Emit 'prepare:'" + mime2);

    if (debugStack.enabled) {
      debugStack("prepareNodeAttributes depth=" + _stackDepth());
    }

    self.asyncEmit("prepare:" + mime2, node, function(error) {
      setImmediate(callback.bind(self, error || mainError));
    });
  });
};

ContentDirectoryService.prototype.emitToJXML = function(node, attributes,
    request, xml, callback) {

  var mime = attributes.mime;
  if (!mime) {
    return callback();
  }

  var self = this;
  this.asyncEmit("toJXML:" + mime, node, attributes, request, xml, function(
      error) {
    if (error === false) {
      return callback();
    }

    var mime2 = mime.split("/")[0] + "/*";

    self.asyncEmit("toJXML:" + mime2, node, attributes, request, xml, function(
        error) {
      if (error !== false) {
        return callback(error);
      }

      callback();
    });
  });
};