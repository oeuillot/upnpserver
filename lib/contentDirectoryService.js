/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Util = require('util');
var Path = require('path');
var url = require('url');
var fs = require('fs');
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
var Xmlns = require('./xmlns');

var Node;
var NodeWeakHashmap = require('./nodeWeakHashmap');
var xmlFilters = require("./xmlFilters").xmlFilters;

var UpnpItem = require('./class/object.item');
var UpnpContainer = require('./class/object.container');

var FileContentProvider = require('./contentProviders/file');

var PREPARING_QUEUE_LIMIT = 4;

var GARBAGE_DELAY_MS = 1000 * 6; // 60 * 60;

var ContentDirectoryService = function(configuration) {

  Node = require('./node');

  Service.call(this, {
    serviceType : "urn:schemas-upnp-org:service:ContentDirectory",
    serviceId : "urn:upnp-org:serviceId:ContentDirectory",
    route: "cds"
  }, configuration);

  var self = this;

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
  // addType (name, type, value, valueList, ns, evented,
  // moderation_rate, additionalProps, preEventCb, postEventCb)
  this.addType("A_ARG_TYPE_BrowseFlag", "string", "", [ "BrowseMetadata",
      "BrowseDirectChildren" ]);
  this.addType("ContainerUpdateIDs", "string", 0, [], null, true, 2, [],
      function() { // concatenate ContainerUpdateIDs before event
        // note : use the "self" var
        var updateIds = self.updateIds;
        self.updateIds = {};
        var concat = [];
        for ( var container in updateIds) {
          var updateId = updateIds[container];
          if (!updateId) {
            continue;
          }
          concat.push(container, updateId);
        }
        self.stateVars["ContainerUpdateIDs"].value = concat.join(",");

      }, function() { // clean ContainerUpdateIDs after event
        self.stateVars["ContainerUpdateIDs"].value = "";
      });
  this.addType("SystemUpdateID", "ui4", 0, [], {
    dt : Xmlns.MICROSOFT_DATATYPES
  }, true, 2);
  this.addType("A_ARG_TYPE_Count", "ui4", 0);
  this.addType("A_ARG_TYPE_SortCriteria", "string", "");
  this.addType("A_ARG_TYPE_SearchCriteria", "string", "");

  this.addType("SortCapabilities", "string", [ "dc:title", "upnp:genre",
      "upnp:artist", "upnp:author", "upnp:album", "upnp:rating" ].join(','),
      [], {
        upnp : Xmlns.UPNP_METADATA,
        dc : Xmlns.PURL_ELEMENT
      });
  this.addType("A_ARG_TYPE_Index", "ui4", 0);
  this.addType("A_ARG_TYPE_ObjectID", "string");
  this.addType("A_ARG_TYPE_UpdateID", "ui4", 0);
  this.addType("A_ARG_TYPE_Result", "string");
  this.addType("SearchCapabilities", "string", [ "dc:title", "upnp:genre",
      "upnp:artist", "upnp:author", "upnp:album", "upnp:rating" ].join(','),
      [], {
        upnp : Xmlns.UPNP_METADATA,
        dc : Xmlns.PURL_ELEMENT
      });
  this.addType("A_ARG_TYPE_Filter", "string");

  if (this.version > 2){
    // cds v3 implements lastChange event model
    // http://www.upnp.org/schemas/av/cds-event-v1-20080930.xsd
    // http://upnp.org/specs/av/UPnP-av-AVDataStructureTemplate-v1.pdf table 3
      this.addType("LastChange", "string", "", [], {"cds-event" : "urn:schemas-upnp-org:av:cds-event"}, true, 0.2);
  }


  this.jasminFileMetadatasSupport = (configuration.jasminFileMetadatasSupport === true);
  this.jasminMusicMetadatasSupport = (configuration.jasminMusicMetadatasSupport === true);

  this.secDlnaSupport = (configuration.secDlnaSupport === true);

  if (process.env.JASMIN) {
    // Will be removed soon :-)
    this.jasminFileMetadatasSupport = true;
    this.jasminMusicMetadatasSupport = true;

  }

  this._childrenWeakHashmap = new NodeWeakHashmap("childrenList", 1000, true);
  this.repositories = [];
  // this.systemUpdateId = 0;
  this._previousSystemUpdateId = -1;
  this.updateIds = {};
  this.contentPath = "/" + this.route + "/content/";

  this._preparingQueue = Async.priorityQueue(this._preparingNodeWorker
      .bind(this), PREPARING_QUEUE_LIMIT);

  this._fileContentProvider = new FileContentProvider();

  this.upnpClasses = {};  //configuration.upnpClasses;
  this.contentHandlers = []; //configuration.contentHandlers;
  this.repositories = [];
  this.contentProviders = configuration.contentProviders;
  this.contentHandlersById = {};

  this.upnpClassesByMimeType = {};

};

Util.inherits(ContentDirectoryService, Service);

module.exports = ContentDirectoryService;

ContentDirectoryService.LOW_PRIORITY = 100;
ContentDirectoryService.MED_PRIORITY = 50;
ContentDirectoryService.SYNC_PRIORITY = 0;


ContentDirectoryService.SEC_DLNA_XMLNS = "http://www.sec.co.kr/dlna";

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

/* cds v3 LastChange event model
 * TODO:
 * call this on node add, node change, node delete, transfert complete
 * NOTE: call this before node delete, and after other node changes
 * see http://upnp.org/specs/av/UPnP-av-ContentDirectory-v3-Service.pdf
 * section 2.2.15
 * stUpdate is used on a container when many subtree changes are needed
 * stDone action is to be performed at end of subtree changes
 */
ContentDirectoryService.prototype.lastChange = function(action, node, isContainer){
  // http://www.upnp.org/schemas/av/cds-event.xsd
  var self = this;

  /* CDS 3+ spec */
  if (this.version < 3) return;

  var LastChange = self.stateVars["LastChange"];
  var lastJXML = LastChange.get();
  if (!lastJXML){
    lastJXML = {
     _name:"StateEvent",
     _content : []
   };
  }
  // find action or create one
  var stateEvent = lastJXML._content;
  var stateAction;
  var len = stateEvent.length;
  for (var i=0; i<len; i++){
    if (stateEvent[i]._name == action && stateEvent[i]._attrs["objID"] == node.id){
      stateAction = stateEvent[i]._attrs;
      break;
    }
  }
  if (!stateAction){
    var newstateAction = {
      _name:action,
      _attrs:{
        "objID":node.id,
        "updateID":self.stateVars["SystemUpdateID"].get()
      }
    };
    stateAction = newstateAction._attrs;
  }

  switch (action){
    case "objAdd":{
      stateAction["objParentID"] = node.parentId;
      stateAction["objClass"]    = node.upnpClass;
    }
    case "objMod":
    case "objDel":
    // TODO: handle stUpdate (subtree update)

      stateAction["stUpdate"] = isContainer;
    break;
    default:
  }

  LastChange.set(lastJXML);
}

/**
 * Require and instanciate files from path filtered by pattern
 * @param {string} relativepath without starting nor ending /
 */
ContentDirectoryService.prototype.genericLoader = function( relativepath,
  pattern, onRequire, callback){

  var self = this;
  fs.readdir(Path.resolve(__dirname + "/" + relativepath + "/"), function(err, ClassFiles){
    if (err) return callback(err);
    Async.eachSeries(ClassFiles, function(file, next){
      if (pattern.test(file)){
        var ClassName = file.substr(0, file.length-3);
        var Class = require("./" + relativepath + "/" + ClassName);
        var instance = new Class();
        return onRequire(ClassName, instance, next);
      }
      next(null);
    },function(error){
        callback(error, true);
    });
  });
}

ContentDirectoryService.prototype.initUpnpClass = function(callback){
  var self = this;
  self.genericLoader("class", /^object.*/,

    function(name, instance, callback){

      self.upnpClasses[name] = instance;
      callback(null);

    }, function(error, res){
      callback(error, true);
  });
}

ContentDirectoryService.prototype.initContentHandlers = function(callback){

  var self = this;

  self.genericLoader("contentHandlers", /ContentHandler/,

    function(name, instance, callback){

      self.contentHandlers.push(instance);
      self.contentHandlersById[instance.key] = instance;
      instance.initialize(self, callback);

    }, function(error, res){
      callback(error, true);
  });

}

/**
 * addRepository paths.
 *
 * @param configuration
 */
ContentDirectoryService.prototype.addRepository = function(configuration) {

  if (typeof (configuration) === "string") {
    configuration = {
      type:"path",
      mountPoint:"/",
      path:configuration
    };
  }

  if (typeof (configuration) === "object") {

    configuration.type       = configuration.type &&
                               configuration.type.toLowerCase() ||
                               "path";

    configuration.mountPoint = configuration.mountPoint || "/";

    var Repository = require("./repositories/" + configuration.type + "Repository");
    var instance   = new Repository(configuration);
    this.repositories.push(instance);

    return;
  }

  throw new Error("Invalid path '" + util.inspect(configuration) + "'");
};

ContentDirectoryService.prototype.initRepositories = function(callback){

    var self = this;

    var directories = this.configuration.directories;
    if (directories) {
      for ( var key in directories) {
        var directory = directories[key];
        directory.type = "path";
        self.addRepository(directory);
      }
    }

    var paths = this.configuration.paths;
    if (typeof (paths) === "string") {
      this.addRepository(paths);
    } else if (Util.isArray(paths)) {
      paths.forEach(function(path) {
        self.addRepository(path);
      });
    };

    self.lastChange("stDone", this.root, false);

    callback(null, true);
}

ContentDirectoryService.prototype.initialize = function(device, callback) {

  this.dlnaSupport = device.dlnaSupport;


  var self = this;
  Service.prototype.initialize.call(this, device, function(error) {
    if (error) {
      return callback(error);
    }


    Async.series({
        initRepositories:self.initRepositories.bind(self),
        contentHandlers:self.initContentHandlers.bind(self),
        upnpClass:self.initUpnpClass.bind(self),
        registry:self.initializeRegistry.bind(self),
        installRoot:self._installRoot.bind(self),
        repositories:self.addRepositories.bind(self)
    },
    function(error){
      if (error) {
        console.error(error);
        return callback(error);
      }
      console.log("init success");

      _setupContentHandlerMimeTypes(self.upnpClassesByMimeType, self.upnpClasses,
          false);

      // Kept here for Intel upnp toolkit, but not in upnp spec
      if (device.configuration.enableIntelToolkitSupport){
        self._intervalTimer = setInterval(function() {
          self._sendItemChangesEvent();
        }, 1500);
      }
      if (device.configuration.garbageItems) {
        debug("Garbage items is enabled !");

        self._intervalGarbage = setInterval(function() {
          self._garbageItems();
        }, Math.floor(GARBAGE_DELAY_MS / 10));

        self._lastRequestDate = Date.now();
      }


      callback(null, self);


    });

  });
};

ContentDirectoryService.prototype._installRoot = function(callback) {

  if (this.root) {
    return callback(null, this.root);
  }

  var self = this;

  var i18n = self.device.configuration.i18n;

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

    // notify we are adding many nodes under the root
    self.lastChange("objAdd", node, true);

    self.registerNode(node, function(error) {
      if (error) {
        return callback(error);
      }

      self.root = node;

      callback(null, node);
    });
  });

};

ContentDirectoryService.prototype.addRepositories = function(callback) {

  var repositories = this.repositories;
  if (!repositories || !repositories.length) {
    return callback("no repositories");
  }

  //  repositories = repositories.slice(0); // clone
  repositories.sort(function(r1, r2) {
    return r1.mountPoint.length - r2.mountPoint.length;
  });

  debug("Adding ", repositories.length, " repositories");

  var self = this;
  Async.eachSeries(repositories, function(repository, callback) {

    debug("Adding repository", repository.mountPoint);

    repository.initialize(self, function(error) {
      if (error) {
        return callback(error);
      }
      callback(null, repository);
    });

  }, callback);
};

ContentDirectoryService.prototype.initializeRegistry = function(callback) {

  var configuration = this.configuration;
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

var _splitXmlnsNameRegExp = /([^:]+:)?([^@]+)(@.*)?$/i;

function returnTRUE() {
  return true;
}

var defaultFilters = {};
defaultFilters[Xmlns.DIDL_LITE] = {
  "item" : {
    id : true,
    parentID : true,
    refID : true,
    restricted : true
  },
  "container" : {
    id : true,
    parentID : true,
    refID : true,
    restricted : true,
    childCount : true
  }
};
defaultFilters[Xmlns.UPNP_METADATA] = {
  "class" : {
    '*' : true
  }
};
defaultFilters[Xmlns.PURL_ELEMENT] = {
  "title" : {
    '*' : true
  }
};

ContentDirectoryService.prototype._preparefilterCallback = function(
    filterExpression, namespaceURIs) {

  if (!filterExpression || filterExpression === "*") {
    return returnTRUE;
  }

  var filters = {};

  filterExpression.split(',').forEach(function(token) {
    var sp = _splitXmlnsNameRegExp.exec(token);
    if (!sp) {
      console.error("Unknown filter token format '" + token + "'");
      return;
    }

    // console.log("Register: ", sp);

    var prefix = (sp[1] && sp[1].slice(0, -1)) || "";
    var element = sp[2];
    var attribute = (sp[3] && sp[3].slice(1)) || "*";

    // We definitely can't rely on Filter namespace
    // for this, so setting default ones here
    // Maybe also add didl-lite ones
    namespaceURIs["dc"]   = Xmlns.PURL_ELEMENT;
    namespaceURIs["upnp"] = Xmlns.UPNP_METADATA;

    var xmlns = namespaceURIs[prefix];
    if (!xmlns) {
      console.error("Unknown xmlns for prefix", prefix, " token=", token);
      return;
    }

    var fs = filters[xmlns];
    if (!fs) {
      fs = {};
      filters[xmlns] = fs;
    }

    var elt = fs[element];
    if (!elt) {
      elt = {};
      fs[element] = elt;
    }

    elt[attribute] = true;
  });

  return function(ns, element, attribute) {
    if (!attribute) {
      attribute = "*";
    }

    var df = defaultFilters[ns];
    var dfe;
    if (df) {
      dfe = df[element];
      if (dfe && dfe[attribute]) {
        return true;
      }
    }

    df = filters[ns];
    if (df) {
      dfe = df[element];
      if (dfe && dfe[attribute]) {
        return true;
      }
    }

    return false;
  };
};

ContentDirectoryService.prototype.processSoap_Search = function(xml, request,
    response, callback) {

  function childNamed(name, xmlns) {
    var node = Service._childNamed(xml, name, xmlns);
    return node;
  }

  var objectId = this.root.id;
  var node = childNamed("ContainerID", Xmlns.UPNP_SERVICE);
  if (node) {
    objectId = node.val;
  }

  var searchCriteria = null;
  node = childNamed("SearchCriteria", Xmlns.UPNP_SERVICE);
  if (node) {
    searchCriteria = node.val;
  }

  var filterCallback = null;
  node = childNamed("Filter", Xmlns.UPNP_SERVICE);
  if (node && node.val) {
    // var fs = node.val;
    // console.log(Util.inspect(node));

    // NOTE :
    // we cant rely only on Filter node xmlns
    filterCallback = this._preparefilterCallback(node.val, node.namespaceURIs);
  }

  var startingIndex = -1;
  node = childNamed("StartingIndex", Xmlns.UPNP_SERVICE);
  if (node) {
    startingIndex = parseInt(node.val, 10);
  }

  var requestedCount = -1;
  node = childNamed("RequestedCount", Xmlns.UPNP_SERVICE);
  if (node) {
    requestedCount = parseInt(node.val, 10);
  }

  var sortCriteria = null;
  node = childNamed("SortCriteria", Xmlns.UPNP_SERVICE);
  if (node) {
    sortCriteria = node.val;
  }

  debug("CDS: Search sortCriteria:" + sortCriteria + " requestedCount:" +
      requestedCount + " ContainerID:" + objectId + " startingIndex:" +
      startingIndex);

  return this.responseSearch(response, request, objectId, filterCallback,
      startingIndex, requestedCount, sortCriteria, searchCriteria, callback);
};

ContentDirectoryService.prototype._newDidlJxml = function() {

  var xmlDidl = {
    _name : "DIDL-Lite",
    _attrs : {}
  };

  var attrs = xmlDidl._attrs;

  attrs["xmlns"] = Xmlns.DIDL_LITE;
  attrs["xmlns:dc"] = Xmlns.PURL_ELEMENT;
  attrs["xmlns:upnp"] = Xmlns.UPNP_METADATA;

  if (this.dlnaSupport) {
    attrs["xmlns:dlna"] = Xmlns.DLNA_METADATA;
  }

  if (this.jasminFileMetadatasSupport) {
    attrs["xmlns:fm"] = Xmlns.JASMIN_FILEMETADATA;
  }

  if (this.jasminMusicMetadatasSupport) {
    attrs["xmlns:mm"] = Xmlns.JASMIN_MUSICMETADATA;
  }

  if (this.secDlnaSupport) {
    attrs["xmlns:sec"] = Xmlns.SEC_DLNA_XMLNS;
  }

  return xmlDidl;
};

ContentDirectoryService.prototype._newRepositoryRequest = function(request) {

  var localhost = request.myHostname;
  var localport = request.socket.localPort;

  var repositoryRequest = {
    contentURL : "http://" + localhost + ":" + localport + this.contentPath,
    request : request,
    contentDirectoryService : this,
    dlnaSupport : this.dlnaSupport,
    secDlnaSupport : this.secDlnaSupport,
    jasminFileMetadatasSupport : this.jasminFileMetadatasSupport,
    jasminMusicMetadatasSupport : this.jasminMusicMetadatasSupport
  };

  return repositoryRequest;
};

ContentDirectoryService.prototype.responseSearch = function(response, request,
    containerId, filterCallback, startingIndex, requestedCount, sortCriteria,
    searchCriteria, callback) {

  if (debug.enabled) {
    debug("Request containerId=" + containerId + " filterCallback=" +
        !!filterCallback + " startingIndex=" + startingIndex +
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

            self.emit("Search", request, item);

            function processList(list, node) {

              self.emit("filterList", request, node, list);

              var lxml = [];

              var xmlDidl = self._newDidlJxml();

              var repositoryRequest = self._newRepositoryRequest(request);

              Async
                  .eachSeries(
                      list,
                      function(child, callback) {
                        if (!child) {
                          logger.warn("ALERT not a node ", child);
                          return callback(null, list);
                        }

                        self.getNodeJXML(child, null, repositoryRequest,
                            filterCallback, function(error, itemJXML) {
                              if (error) {
                                return callback(error);
                              }

                              lxml.push(itemJXML);
                              setImmediate(callback);
                            });

                      },
                      function(error) {
                        if (error) {
                          return callback(501, error);
                        }

                        sortCriteria = sortCriteria ||
                            node.attributes.defaultSort ||
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

                        if (filterCallback) {
                          lxml.forEach(function(x) {
                            filterCallback(x);
                          });
                        }

                        xmlDidl._content = lxml;

                        var didl = jstoxml.toXML(xmlDidl, {
                          header : false,
                          indent : "",
                          filter : xmlFilters
                        });

  // TODO:
  // According http://upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf
  // section 2.5.4.
  // Note that since the DIDL-Lite format of Result is based on XML, it needs to
  // be escaped (using the normal XML rules: [XML] Section 2.4 Character Data
  // and Markup) before embedding in a SOAP response message


                        debugDIDL("SearchContainer didl=", didl);

                        self
                            .responseSoap(
                                response,
                                "Search",
                                {
                                  _name : "u:SearchResponse",
                                  _attrs : {
                                    "xmlns:u" : self.type
                                  },
                                  _content : {
                                    Result : didl,
                                    NumberReturned : lxml.length,
                                    TotalMatches : total,
                                    UpdateID : (node.id) ? node.updateId : self.stateVars["SystemUpdateID"]
                                        .get()
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
  var node = childNamed("SearchCriteria", Xmlns.UPNP_SERVICE);
  if (node) {
    searchCriteria = node.val;
  }

  var browseFlag = null;
  node = childNamed("BrowseFlag", Xmlns.UPNP_SERVICE);
  if (node) {
    browseFlag = node.val;
  }

  var filterCallback = null;
  node = childNamed("Filter", Xmlns.UPNP_SERVICE);
  if (node && node.val) {
    // var fs = node.val;

    filterCallback = this._preparefilterCallback(node.val, node.namespaceURIs);
  }

  var objectId = this.root.id;
  node = childNamed("ObjectID", Xmlns.UPNP_SERVICE);
  if (node) {
    objectId = parseInt(node.val, 10);
  }

  if (debug.enabled) {
    debug("CDS: Browse starting  (flags=" + browseFlag + ") of item " +
        objectId);
  }

  var startingIndex = -1;
  node = childNamed("StartingIndex", Xmlns.UPNP_SERVICE);
  if (node) {
    startingIndex = parseInt(node.val, 10);
  }

  var requestedCount = -1;
  node = childNamed("RequestedCount", Xmlns.UPNP_SERVICE);
  if (node) {
    requestedCount = parseInt(node.val, 10);
  }

  var sortCriteria = null;
  node = childNamed("SortCriteria", Xmlns.UPNP_SERVICE);
  if (node) {
    sortCriteria = node.val;
  }
  debug("CDS: Browse sortCriteria:" + sortCriteria + " browseFlag:" +
      browseFlag + " requestedCount:" + requestedCount + " objectId:" +
      objectId + " startingIndex:" + startingIndex);

  if (browseFlag === "BrowseMetadata") {
    return this.processBrowseMetadata(response, request, objectId,
        filterCallback, callback);
  }

  if (browseFlag === "BrowseDirectChildren") {
    return this.processBrowseDirectChildren(response, request, objectId,
        filterCallback, startingIndex, requestedCount, sortCriteria,
        searchCriteria, callback);
  }

  callback("Unknown browseFlag '" + browseFlag + "'");
};

ContentDirectoryService.prototype.processBrowseMetadata = function(response,
    request, objectId, filterCallback, callback) {

  logger.info("Request ObjectId=" + objectId);

  var self = this;
  this
      .getNodeById(
          objectId,
          function(error, node) {

            if (error) {
              return callback(701, error);
            }

            if (!node) {
              return callback(701, "CDS: BrowseObject Can not find node " +
                  objectId);
            }
            if (debug.enabled) {
              debug("CDS: BrowseObject node=#", node.id, " error=", error);
            }

            self.emit("BrowseMetadata", request, node);

            var repositoryRequest = self._newRepositoryRequest(request);

            function produceDidl(node, nodeXML) {


              var xmlDidl = self._newDidlJxml();
              xmlDidl._content = nodeXML;

              var didl = jstoxml.toXML(xmlDidl, {
                header : false,
                indent : " ",
                filter : xmlFilters
              });

              if (debugDIDL.enabled) {
                debugDIDL("BrowseObject didl=", didl);
              }

  // TODO:
  // According http://upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf
  // section 2.5.4.
  // Note that since the DIDL-Lite format of Result is based on XML, it needs to
  // be escaped (using the normal XML rules: [XML] Section 2.4 Character Data
  // and Markup) before embedding in a SOAP response message


              self
                  .responseSoap(
                      response,
                      "Browse",
                      {
                        _name : "u:BrowseResponse",
                        _attrs : {
                          "xmlns:u" : self.type
                        },
                        _content : {
                          Result : didl,
                          NumberReturned : 1,
                          TotalMatches : 1,
                          UpdateID : (node.id) ? node.updateId : self.stateVars["SystemUpdateID"]
                              .get()
                        }
                      }, function(code, error) {
                        if (error) {
                          return callback(code, error);
                        }

                        // logger.debug("CDS: Browse end " + containerId);
                        callback(null);
                      });
            }

            self.getNodeJXML(node, null, repositoryRequest, filterCallback,
                function(error, nodeJXML) {
                  if (error) {
                    return callback(500, error);
                  }

                  return produceDidl(node, nodeJXML, callback);
                });
          });
};

ContentDirectoryService.prototype.getNodeJXML = function(node,
    inheritedAttributes, repositoryRequest, filterCallback, callback) {

  var self = this;

  var refID = node.refID;
  if (refID) {
    node.resolveLink(function(error, refNode) {
      if (error) {
        return callback(error);
      }

      var linkAttributes = node.attributes;

      self.getNodeJXML(refNode, linkAttributes, repositoryRequest,
          filterCallback, function(error, refNodeJXML) {
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

        itemClass.toJXML(node, attributes, repositoryRequest, filterCallback,
            function(error, itemJXML) {
              if (error) {
                return callback(error);
              }

              self.emitToJXML(node, attributes, repositoryRequest,
                  filterCallback, itemJXML, function(error) {
                    callback(error, itemJXML);
                  });
            });
      });
};

ContentDirectoryService.prototype.processBrowseDirectChildren = function(
    response, request, containerId, filterCallback, startingIndex,
    requestedCount, sortCriteria, searchCriteria, callback) {

  if (debug.enabled) {
    debug("Request containerId=" + containerId + " filterCallback=" +
        !!filterCallback + " startingIndex=" + startingIndex +
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


              var xmlDidl = self._newDidlJxml();

              var repositoryRequest = self._newRepositoryRequest(request);

              Async
                  .eachSeries(
                      list,
                      function(child, callback) {
                        if (!child) {
                          logger.warn("ALERT not a node ", child);
                          return callback(null, list);
                        }

                        self.getNodeJXML(child, null, repositoryRequest,
                            filterCallback, function(error, itemJXML) {
                              if (error) {
                                return callback(error);
                              }

                              lxml.push(itemJXML);
                              setImmediate(callback);
                            });

                      },
                      function(error) {
                        if (error) {
                          return callback(501, error);
                        }

                        // if (filter) {
                        // // We can apply filters HERE
                        // }

                        sortCriteria = sortCriteria ||
                            node.attributes.defaultSort ||
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

                        xmlDidl._content = lxml;

                        var didl = jstoxml.toXML(xmlDidl, {
                          header : false,
                          indent : "",
                          filter : xmlFilters
                        });

  // TODO:
  // According http://upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf
  // section 2.5.4.
  // Note that since the DIDL-Lite format of Result is based on XML, it needs to
  // be escaped (using the normal XML rules: [XML] Section 2.4 Character Data
  // and Markup) before embedding in a SOAP response message


                        if (debugDIDL.enabled) {
                          debugDIDL("BrowseContainer didl=", didl);
                        }

                        self
                            .responseSoap(
                                response,
                                "Browse",
                                {
                                  _name : "u:BrowseResponse",
                                  _attrs : {
                                    "xmlns:u" : self.type
                                  },
                                  _content : {
                                    Result : didl,
                                    NumberReturned : lxml.length,
                                    TotalMatches : total,
                                    UpdateID : (node.id) ? node.updateId : self.stateVars["SystemUpdateID"]
                                        .get()
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

  this.lastChange("objAdd", node, false);

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
    self.lastChange("objAdd", node, false);

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

  // Very expensive, this function is called very very often
  this.updateIds[node.id] = node.updateId;
  this.stateVars["SystemUpdateID"]
      .set(this.stateVars["SystemUpdateID"].get() + 1);
  this.stateVars["ContainerUpdateIDs"].moderate();
};

ContentDirectoryService.prototype.updateNode = function(node, callback) {
  // Il faut identifier le repository associé à cet item
  var self = this;
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
    self.lastChange("objMod", node);
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

  self.lastChange("objDel", node);

  this.unregisterNodeById(node.id, callback);
};

ContentDirectoryService.prototype.processRequest = function(request, response,
    path, callback) {

  this._lastRequestDate = Date.now();
  request.contentDirectoryService = this;

  var reg = /([^\/]+)(\/.*)?/.exec(path);
  if (!reg) {
    return callback("Invalid path (" + path + ")");
  }
  var segment = reg[1];
  var action = reg[2] && reg[2].slice(1);

  var self = this;
  switch (segment) {
  case "content":
    var parameters = url.parse(request.url, true).query;

    var id = parseInt(action, 10);

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

        response.writeHead(404, 'Node #' + id + ' not found');
        response.end();
        return callback(null, true);
      }

      node.resolveLink(function(error, nodeRef) {

        self.emit("request", request, nodeRef, node, parameters);

        self.processNodeContent(nodeRef, request, response, path, parameters,
            callback);
      });
    });

  case "tree":
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

// kept for Intel upnp toolkit, but not in upnp spec
ContentDirectoryService.prototype._sendItemChangesEvent = function() {
  var systemUpdateId = this.stateVars["SystemUpdateID"].get();
  if (this._previousSystemUpdateId == systemUpdateId) {
    // return; // We must always send message !
  }
  this._previousSystemUpdateId = systemUpdateId;

  var xmlProps = [];

  this.stateVars["SystemUpdateID"].pushEventJXML(xmlProps);

  var message = this.stateVars["ContainerUpdateIDs"].get();
  if (message.length) {
    this.stateVars["ContainerUpdateIDs"].pushEventJXML(xmlProps);
  }

  this.makeEvent(xmlProps);
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
    request, filterCallback, xml, callback) {

  var mime = attributes.mime;
  if (!mime) {
    return callback();
  }

  var self = this;

  var eventName = "toJXML:" + mime;

  var mime2 = mime.split("/")[0] + "/*";
  var eventName2 = "toJXML:" + mime2;

  if (!this.hasListeners(eventName) && !this.hasListeners(eventName2)) {
    return callback();
  }

  this.asyncEmit(eventName, node, attributes, request, filterCallback, xml,
      function(error) {
        if (error === false) {
          return callback();
        }

        self.asyncEmit(eventName2, node, attributes, request, filterCallback,
            xml, function(error) {
              if (error !== false) {
                return callback(error);
              }

              callback();
            });
      });
};
