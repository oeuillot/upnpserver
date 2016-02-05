/*jslint node: true, esversion: 6, sub: true */
"use strict";

const Util = require('util');
const Path = require('path');
const url = require('url');
const assert = require('assert');
const rangeParser = require('range-parser');
const os = require('os');

const debugFactory = require('debug');
const debug = debugFactory('upnpserver:contentDirectoryService');
const debugDIDL = debugFactory('upnpserver:contentDirectoryService:didl');
const debugGarbage = debugFactory('upnpserver:contentDirectoryService:garbage');
const debugStack = debugFactory('upnpserver:stack');
const debugMetas = debugFactory('upnpserver:contentDirectoryService:metas');

const Async = require("async");
const Mime = require('mime');
const jstoxml = require('./util/jstoxml');
const send = require('send');

const logger = require('./logger');
const Service = require("./service");
const Xmlns = require('./xmlns');

var Node;
const NodeWeakHashmap = require('./util/nodeWeakHashmap');
const xmlFilters = require("./util/xmlFilters");

const UpnpItem = require('./class/object.item');
const UpnpContainer = require('./class/object.container');

const FileContentProvider = require('./contentProviders/file');

const FilterSearchEngine = require('./filterSearchEngine');

const CONTENT_PATH = "/content/";

const PREPARING_QUEUE_CONCURRENCY = 4;

const PROTOCOL_SPLITTER=/^([A-Z0-9_\-]+)/i;

class ContentDirectoryService extends Service {
  constructor(configuration) {

    Node = require('./node');

    super({
      serviceType : "urn:schemas-upnp-org:service:ContentDirectory:1",
      serviceId : "urn:upnp-org:serviceId:ContentDirectory",
      route : "cds"
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

    // addType (name, type, value, valueList, ns, evented,
    // moderation_rate, additionalProps, preEventCb, postEventCb)
    this.addType("A_ARG_TYPE_BrowseFlag", "string", "", [ "BrowseMetadata",
                                                          "BrowseDirectChildren" ]);
    this.addType("ContainerUpdateIDs", "string", 0, [], null, true, 2, [],
        () => { // concatenate ContainerUpdateIDs before event
          var updateIds = this.updateIds;
          this.updateIds = {};
          var concat = [];
          for ( var container in updateIds) {
            var updateId = updateIds[container];
            if (!updateId) {
              continue;
            }
            concat.push(container, updateId);
          }
          this.stateVars["ContainerUpdateIDs"].value = concat.join(",");

        }, () => { // clean ContainerUpdateIDs after event
          this.stateVars["ContainerUpdateIDs"].value = "";
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
    this.addType("SearchCapabilities", "string", 
        [ "dc:title", "upnp:genre", "upnp:artist", "upnp:author", "upnp:album", "upnp:rating" ].join(','),
        [], {
      upnp : Xmlns.UPNP_METADATA,
      dc : Xmlns.PURL_ELEMENT
    });
    this.addType("A_ARG_TYPE_Filter", "string");

    this.jasminFileMetadatasSupport = (configuration.jasminFileMetadatasSupport !== false);
    this.jasminMusicMetadatasSupport = (configuration.jasminMusicMetadatasSupport !== false);
    this.jasminMovieMetadatasSupport = (configuration.jasminMovieMetadatasSupport !== false);

    this.dlnaSupport = (configuration.dlnaSupport!==false);
    this.microsoftSupport = (configuration.microsoftSupport!==false);
    this.secDlnaSupport = (configuration.secDlnaSupport !== false);

    this._childrenWeakHashmap = new NodeWeakHashmap("childrenList", 5000, true);
    this._childrenByTitleWeakHashmap = new NodeWeakHashmap("childrenListByTitle", 5000, true);

    this.repositories = [];
    // this.systemUpdateId = 0;
    this._previousSystemUpdateId = -1;
    this.updateIds = {};
    this.contentPath = "/" + this.route + "/content/";

    this.upnpClasses = configuration.upnpClasses;
    this.contentHandlers = configuration.contentHandlers;
    this.contentProviders = configuration.contentProviders;
    this.contentHandlersByName = {};
    this._contentProvidersByProtocol = {};

    this.upnpClassesByMimeType = {};
    _setupContentHandlerMimeTypes(this.upnpClassesByMimeType, this.upnpClasses, false);
  }

  /**
   * 
   */
  initialize(upnpServer, callback) {

    super.initialize(upnpServer, (error) => {
      if (error) {
        return callback(error);
      }

      var contentProvidersByProtocol = this._contentProvidersByProtocol;

      Async.eachSeries(this.contentProviders, (contentProvider, callback) => {
        var protocol=contentProvider.protocol;
        debug("Initialize contentProvider", contentProvider.name, "for protocol", protocol);

        contentProvidersByProtocol[protocol.toLowerCase()] = contentProvider;

        // debug("Protocol=",contentProvider.protocol,"platform=",os.platform());

        if (protocol==="file" && os.platform()==='win32') {
          for(var i=0;i<26;i++) {
            // Map all drives letter
            contentProvidersByProtocol[String.fromCharCode(97+i)]=contentProvider;
          }          
        }

        contentProvider.initialize(this, callback);

      }, (error) => {
        if (error) {
          logger.error("Initialize content handlers error", error);

          return callback(error);
        }

        Async.eachSeries(this.contentHandlers, (contentHandler, callback) => {
          debug("Initialize contentHandler", contentHandler.name, "for mimeTypes", contentHandler.mimeTypes);
          this.contentHandlersByName[contentHandler.name] = contentHandler;

          contentHandler.initialize(this, callback);

        }, (error) => {
          if (error) {
            logger.error("Initialize content handlers error", error);

            return callback(error);
          }

          this._installRoot((error, root) => {
            if (error) {
              return callback(error);
            }

            var repositories = upnpServer.configuration.repositories;
            this.addRepositories(repositories, (error) => {
              if (error) {
                return callback(error);
              }
              
              // Kept here for Intel upnp toolkit, but not in upnp spec
              if (upnpServer.configuration.enableIntelToolkitSupport) {
                this._intervalTimer = setInterval(() => this._sendItemChangesEvent(), 1500);
              }

              callback(null, this);
            });
            return;
          });
        });
      });
    });
  }

  /**
   * 
   */
  _installRoot(callback) {
    if (this.root) {
      return callback(null, this.root);
    }

    this.initializeRegistry((error) => {
      if (error) {
        logger.error("Can not initialize registry", error);
        return callback(error);
      }

      this._nodeRegistry.getNodeById(0, (error, node) => {
        if (error) {
          return callback(error);
        }
        if (node) {
          debug("Set root to #", node.id);
          this.root = node;
          return callback(null, node);
        }

        var i18n = this.upnpServer.configuration.i18n;

        this.createNode("root", UpnpContainer.UPNP_CLASS, {
          searchable : false,
          restricted : true,
          title : i18n.ROOT_NAME,
          metadatas : [ {
            name : "upnp:writeStatus",
            content : "NOT_WRITABLE"
          } ]

        }, (node) => {
          node._path = "/";
          node._id = 0; // Force id to 0
          node._parentId = -1;

        }, (error, node) => {
          if (error) {
            return callback(error);
          }

          this.root = node;

          callback(null, node);
        });
      });
    });
  }

  /**
   * 
   */
  addRepositories(repositories, callback) {

    if (!repositories || !repositories.length) {
      return callback("no repositories");
    }

    repositories = repositories.slice(0); // clone
    repositories.sort((r1, r2) => r1.mountPath.length - r2.mountPath.length);

    debug("Adding", repositories.length, "repositories");

    Async.eachSeries(repositories, (repository, callback) => {

      debug("Adding repository", repository.mountPath);

      this.addRepository(repository, callback);

    }, callback);
  }

  /**
   * 
   */
  initializeRegistry(callback) {
    var configuration = this.upnpServer.configuration;
    var nodeRegistryName = configuration.registryDb || "memory";

    var NodeRegistryClass = require("./db/" + nodeRegistryName + "Registry");
    this._nodeRegistry = new NodeRegistryClass(configuration);

    this._nodeRegistry.initialize(this, (error) => {
      if (error) {
        return callback(error);
      }

      callback(null);
    });
  }

  /**
   * 
   */
  addRepository(repository, callback) {

    var hashKey=JSON.stringify(repository.hashKey);

    debug("Add repository",hashKey);

    this._nodeRegistry.registerRepository(repository, hashKey, (error, repository) => {
      if (error) {
        logger.error("Can not register repository", error);
        return callback(error);
      }

      this._installRoot((error, root) => {
        if (error) {
          logger.error("Can not install root",error);
          return callback(error);
        }

        debug("Initialize repository", repository);

        repository.initialize(this, (error) => {
          if (error) {
            return callback(error);
          }

          this.repositories.push(repository);
          callback(null, repository);
        });
      });
    });
  }

  /**
   * 
   */
  processSoap_Search(xml, request, response, callback) {
    // Browse support Search parameter !
    this.processSoap_Browse(xml, request, response, callback);
  }

  /**
   * 
   */
  _newDidlJxml() {
    var attrs = {
        ["xmlns"]: Xmlns.DIDL_LITE,
        ["xmlns:dc"]: Xmlns.PURL_ELEMENT,
        ["xmlns:upnp"]: Xmlns.UPNP_METADATA
    };

    if (this.dlnaSupport) {
      attrs["xmlns:dlna"] = Xmlns.DLNA_METADATA;
    }

    if (this.secDlnaSupport) {
      attrs["xmlns:sec"] = Xmlns.SEC_DLNA;
    }

    if (this.jasminFileMetadatasSupport) {
      attrs["xmlns:fm"] = Xmlns.JASMIN_FILEMETADATA;
    }
    if (this.jasminMusicMetadatasSupport) {
      attrs["xmlns:mm"] = Xmlns.JASMIN_MUSICMETADATA;
    }
    if (this.jasminMovieMetadatasSupport) {
      attrs["xmlns:mo"] = Xmlns.JASMIN_MOVIEMETADATA;
    }

    var xmlDidl = {
        _name : "DIDL-Lite",
        _attrs : attrs
    };

    return xmlDidl;
  }

  /**
   * 
   */
  _newRepositoryRequest(request) {

    var localhost = request.myHostname;
    var localport = request.socket.localPort;

    var repositoryRequest = {
        contentURL : "http://" + localhost + ":" + localport + this.contentPath,
        request : request,
        contentDirectoryService : this,
        microsoftSupport : this.microsoftSupport,
        dlnaSupport : this.dlnaSupport,
        secDlnaSupport : this.secDlnaSupport,
        jasminFileMetadatasSupport : this.jasminFileMetadatasSupport,
        jasminMusicMetadatasSupport : this.jasminMusicMetadatasSupport,
        jasminMovieMetadatasSupport : this.jasminMovieMetadatasSupport
    };

    return repositoryRequest;
  }

  /**
   * 
   */
  responseSearch(response, request,
      containerId, filterCallback, startingIndex, requestedCount, sortCriteria,
      searchCallback, callback) {

    if (debug.enabled) {
      debug("responseSearch", "Request containerId=" + containerId + " filterCallback=" +
          !!filterCallback + " startingIndex=" + startingIndex +
          " requestedCount=" + requestedCount + " sortCriteria=" + sortCriteria +
          " searchCallback=" + !!searchCallback);
    }

    this.getNodeById(containerId, (error, item) => {

      if (error) {
        logger.error("CDS: Can not getNodeById for id", containerId);
        return callback(501, error);
      }

      if (!item) {
        return callback(710, "CDS: Browser Can not find item " +
            containerId);
      }

      this.emit("Search", request, item);

      var processList = (list, node) => {

        debug("responseSearch", "Emit filterList");

        this.emit("filterList", request, node, list);

        var lxml = [];

        var xmlDidl = this._newDidlJxml();

        var repositoryRequest = this._newRepositoryRequest(request);

        Async.eachSeries(list, (child, callback) => {
          if (!child) {
            logger.warn("ALERT not a node ", child);
            return callback(null, list);
          }

          this._getNodeJXML(child, null, repositoryRequest,
              filterCallback, (error, itemJXML) => {
                if (error) {
                  return callback(error);
                }

                lxml.push(itemJXML);
                setImmediate(callback);
              });

        }, (error) => {
          if (error) {
            return callback(501, error);
          }
          debug("responseSearch", "Get all nodes", lxml);

          sortCriteria = sortCriteria || node.attributes.defaultSort || node.upnpClass.defaultSort;
          if (sortCriteria) {
            _applySortCriteria(lxml, sortCriteria);
          }

          debug("responseSearch", "SortCriteria=",sortCriteria);

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
            lxml.forEach((x) => filterCallback(x));
          }

          xmlDidl._content = lxml;

          var didl = jstoxml.toXML(xmlDidl, {
            header : false,
            indent : "",
            filter : xmlFilters
          });

          debugDIDL("responseSearch", "SearchContainer didl=", didl);

          this.responseSoap(response, "Search",
              {
            _name : "u:SearchResponse",
            _attrs : {
              "xmlns:u" : this.type
            },
            _content : {
              Result : didl,
              NumberReturned : lxml.length,
              TotalMatches : total,
              UpdateID : (node.id) ? node.updateId : this.stateVars["SystemUpdateID"].get()
            }
              }, (error) => {
                if (error) {
                  return callback(501, error);
                }

                debug("responseSearch", "Search end #" + containerId);

                callback(null);
              });
        });
      };

      var filter = (node) => {
        return true;
      };

      if (item.refId) {
        this.getNodeById(item.refId, (error, refItem) => {

          if (error) {
            logger.error("CDS: Can not getNodeById for REF id",
                item.refId);
            return callback(701, error);
          }
          if (!refItem) {
            return callback(701, "CDS: Browser Can not find REF item " +
                item.refId);
          }

          refItem.filterChildNodes(filter, (error, list) => {
            if (error) {
              logger.warn("Can not scan repositories: ", error);
              return callback(710, error);
            }
            return processList(list, item);
          });

        });
        return;
      }

      debug("Browser node #", item.id, "error=", error);

      item.filterChildNodes(filter, (error, list) => {
        debug("responseSearch", "Browser node #", item.id, "filtred error=", error);

        if (error) {
          logger.warn("Can not scan repositories: ", error);
          return callback(710, error);
        }
        return processList(list, item);
      });
    });
  }

  /**
   * 
   */
  processSoap_Browse(xml, request, response, callback) {

    var childNamed = (name, xmlns) => Service._childNamed(xml, name, xmlns);

    var browseFlag = null;
    var node = childNamed("BrowseFlag", Xmlns.UPNP_SERVICE);
    if (node) {
      browseFlag = node.val;
    }

    var searchCriteria = null;
    var searchNode = childNamed("SearchCriteria", Xmlns.UPNP_SERVICE);
    var filterNode = childNamed("Filter", Xmlns.UPNP_SERVICE);

    var filterSearchEngine = new FilterSearchEngine(this, filterNode, searchNode);

    var objectId = this.root.id;
    node = childNamed("ObjectID", Xmlns.UPNP_SERVICE);
    if (node) {
      objectId = this._nodeRegistry.keyFromString(node.val);
    }

    debug("Browse starting  (flags=", browseFlag, ") of item #", objectId);

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
    debug("Browse sortCriteria=", sortCriteria, "browseFlag=", browseFlag,
        "requestedCount=", requestedCount, "objectId=", objectId,
        "startingIndex=", startingIndex);

    if (browseFlag === "BrowseMetadata") {
      return this.processBrowseMetadata(response, request, objectId,
          filterSearchEngine, callback);
    }

    if (browseFlag === "BrowseDirectChildren") {
      return this.processBrowseDirectChildren(response, request, objectId,
          filterSearchEngine, startingIndex, requestedCount, sortCriteria,
          !!searchNode, callback);
    }

    callback("Unknown browseFlag '" + browseFlag + "'");
  }

  /**
   * 
   */
  processBrowseMetadata(response, request, objectId, filterSearchEngine, callback) {

    // logger.info("Request ObjectId=" + objectId);

    this.getNodeById(objectId, (error, node) => {

      if (error) {
        return callback(701, error);
      }

      if (!node) {
        return callback(701, "CDS: BrowseObject Can not find node " +
            objectId);
      }

      debug("BrowseObject node=#", node.id, " error=", error);

      this.emit("BrowseMetadata", request, node);

      var repositoryRequest = this._newRepositoryRequest(request);

      var produceDidl = (node, nodeXML) => {

        var xmlDidl = this._newDidlJxml();
        xmlDidl._content = nodeXML;

        var didl = jstoxml.toXML(xmlDidl, {
          header : false,
          indent : " ",
          filter : xmlFilters
        });

        if (debugDIDL.enabled) {
          debugDIDL("BrowseObject didl=", didl);
        }

        this.responseSoap(response, "Browse",
            {
          _name : "u:BrowseResponse",
          _attrs : {
            "xmlns:u" : this.type
          },
          _content : {
            Result : didl,
            NumberReturned : 1,
            TotalMatches : 1,
            UpdateID : (node.id) ? node.updateId : this.stateVars["SystemUpdateID"]
          .get()
          }
            }, (code, error) => {
              if (error) {
                return callback(code, error);
              }

              // logger.debug("CDS: Browse end " + containerId);
              callback(null);
            });
      };

      filterSearchEngine.start(node);

      this._getNodeJXML(node, null, repositoryRequest,
          filterSearchEngine.func, (error, nodeJXML) => {
            if (error) {
              return callback(500, error);
            }

            nodeJXML = filterSearchEngine.end(nodeJXML);

            return produceDidl(node, nodeJXML, callback);
          });
    });
  }

  /**
   * 
   */
  _getNodeJXML(node, inheritedAttributes, repositoryRequest, filterCallback, callback) {

    debug("_getNodeJXML of #",node.id,"upnpClass=",node.upnpClass);

    var refId = node.refId;
    if (refId) {
      node.resolveLink((error, refNode) => {
        if (error) {
          return callback(error);
        }

        var linkAttributes = node.attributes;

        this._getNodeJXML(refNode, linkAttributes, repositoryRequest,
            filterCallback, (error, refNodeJXML) => {
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
    assert(itemClass, "ItemClass is not defined for node");

    var attributes = node.attributes || {};
    if (inheritedAttributes) {
      attributes = Object.assign({}, attributes, inheritedAttributes);

      // console.log("Merged attribute of #" + node.id + " ", attributes, "from=", node.attributes, "inherit=",
      // inheritedAttributes);
    }

    itemClass.toJXML(node, attributes, repositoryRequest, filterCallback, (error, itemJXML) => {
      if (error) {
        return callback(error);
      }

      this._emitToJXML(node, attributes, repositoryRequest,
          filterCallback, itemJXML, (error) => callback(error, itemJXML));
    });
  }

  /**
   * 
   */
  processBrowseDirectChildren(response, request, containerId, filterSearchEngine, startingIndex,
      requestedCount, sortCriteria, searchMode, callback) {

    if (debug.enabled) {
      debug("Request containerId=" + containerId + " filterSearchEngine=" +
          filterSearchEngine + " startingIndex=" + startingIndex +
          " requestedCount=" + requestedCount + " sortCriteria=" + sortCriteria);
    }

    this.getNodeById(containerId, (error, node) => {

      if (error) {
        logger.error("CDS: Can not getNodeById for id #", containerId);
        return callback(501, error);
      }
      if (!node) {
        return callback(710, "CDS: Browser Can not find node #" + containerId);
      }

      this.emit("BrowseDirectChildren", request, node);

      var processList = (list, node) => {

        this.emit("filterList", request, node, list);

        var lxml = [];

        var xmlDidl = this._newDidlJxml();

        var repositoryRequest = this._newRepositoryRequest(request);

        Async.eachSeries(list, (child, callback) => {
          if (!child) {
            logger.warn("ALERT not a node ", child);
            return callback(null, list);
          }

          filterSearchEngine.start(child);

          this._getNodeJXML(child, null, repositoryRequest,
              filterSearchEngine.func, (error, nodeJXML) => {
                if (error) {
                  return callback(error);
                }

                nodeJXML = filterSearchEngine.end(nodeJXML);
                if (nodeJXML) {
                  lxml.push(nodeJXML);
                }
                setImmediate(callback);
              });

        }, (error) => {
          if (error) {
            return callback(501, error);
          }

          sortCriteria = sortCriteria || (node.attributes && node.attributes.defaultSort) || node.upnpClass.defaultSort;
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

          if (debugDIDL.enabled) {
            debugDIDL("BrowseContainer didl=", didl);
          }

          this.responseSoap(response,
              (searchMode) ? "Search" : "Browse",
                  {
                _name : (searchMode) ? "u:SearchResponse" : "u:BrowseResponse",
                    _attrs : {
                      "xmlns:u" : this.type
                    },
                    _content : {
                      Result : didl,
                      NumberReturned : lxml.length,
                      TotalMatches : total,
                      UpdateID : (node.id) ? node.updateId : this.stateVars["SystemUpdateID"]
                    .get()
                    }
                  }, (error) => {
                    if (error) {
                      return callback(501, error);
                    }

                    debug("Browse end #", containerId);
                    callback(null);
                  });
        });
      };

      if (node.refId) {
        this.getNodeById(node.refId, (error, refNode) => {

          if (error) {
            logger.error("CDS: Can not getNodeById for REF id",
                node.refId);
            return callback(701, error);
          }
          if (!refNode) {
            return callback(701, "CDS: Browser Can not find REF node " +
                node.refId);
          }

          refNode.listChildren((error, list) => {
            if (error) {
              logger.warn("Can not scan repositories: ", error);
              return callback(501, error);
            }

            processList(list, refNode);
          });

        });
        return;
      }

      debug("Browser node #", node.id, "error=", error);

      node.browseChildren( { request: request}, (error, list) => {
        if (error) {
          logger.error("Can not scan repositories: ", error);
          return callback(710, error);
        }

        debug("List children =>", list.length,"nodes");

        processList(list, node);
      });
    });
  }

  /**
   * 
   */
  browseNode(node, options, callback) {
    if (arguments.length===2) {
      callback = options;
      options = undefined;
    }
    options = options || {};
    var path = node.path;

    debug("browseNode nodeID=#", node.id, "path=", path, "repositories.count=",
        this.repositories.length);

    var list = [];

    this.asyncEmit("browse", list, node, options, (error) => {
      if (error) {
        logger.error("CDS: browseNode path='" + path + "' returns error", error);
        return callback(error);
      }

      debug("browseNode #", node.id, "path=", path, "returns=", list.length, "elements.");

      callback(null, list);
    });
  }

  /**
   * 
   */
  createNodeRef(targetNode, name, initCallback, callback) {
    assert(targetNode instanceof Node, "Invalid targetNode parameter");
    assert(name===undefined || name===null || typeof(name)==="string", "Invalid name parameter");
    assert(initCallback===undefined || initCallback===null || typeof(initCallback)==="function", 
    "Invalid initCallback parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    if (name === targetNode.name) {
      // no need to have a name if the referenced has the same !
      name = undefined;
    }

    Node.createRef(targetNode, name, (error, node) => {
      if (error) {
        return callback(error);
      }

      if (initCallback) {
        initCallback(node);
      }

      this.registerNode(node, callback);     
    });
  }

  /**
   * 
   */
  createNode(name, upnpClass, attributes, initCallback, callback) {

    // assert(!attributes, "Invalid attributes parameter"); // It can be undefined ! (link)
    assert(upnpClass, "Invalid upnpClass parameter");
    assert(initCallback===undefined || initCallback===null || typeof(initCallback)==="function", 
    "Invalid initCallback parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    if (typeof (upnpClass) === "string") {
      var uc = this.upnpClasses[upnpClass];
      assert(uc, "Item class is not defined for " + upnpClass);

      upnpClass = uc;
    }

    assert(upnpClass instanceof UpnpItem, "Upnpclass must be an item (name=" +
        name + " upnpClass=" + upnpClass + ")");

    Node.create(this, name, upnpClass, attributes, (error, node) => {
      if (error) {
        return callback(error);
      }

      if (initCallback) {
        initCallback(node);
      }

      this.registerNode(node, callback);
    });
  }

  /**
   * 
   */
  newNodeRef(parent, targetNode, name, initCallback, before, callback) {

    this.createNodeRef(targetNode, name, initCallback, (error, node) => {
      if (error) {
        debug("newNodeRef: createNodeRef error=", error);
        return callback(error);
      }

      parent.insertBefore(node, before, (error) => {
        if (error) {
          debug("newNodeRef: insertBefore error=", error);
          return callback(error);
        }

        return callback(null, node, node.id);
      });
    });
  }

  /**
   * 
   */
  newNode(parentNode, name, upnpClass, attributes, initCallback, before, callback) {

    assert(parentNode instanceof Node, "Invalid parentNode parameter");
    assert(typeof (name) === "string", "Invalid name parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    attributes = attributes || {};

    upnpClass = upnpClass || UpnpItem.UPNP_CLASS;

    this.createNode(name, upnpClass, attributes, initCallback, (error, node) => {
      if (error) {
        logger.error("Can not create node name=", name, "error=", error);
        return callback(error);
      }      

      parentNode.insertBefore(node, before, (error) => {
        if (error) {
          logger.error("Append child error #", node.id, "error=", error);
          return callback(error);
        }

        callback(null, node, node.id);
      });
    });
  }

  /**
   * 
   */
  registerUpdate(node) {

    // Very expensive, this function is called very very often
    this.updateIds[node.id] = node.updateId;
    this.stateVars["SystemUpdateID"].set(this.stateVars["SystemUpdateID"].get() + 1);
    this.stateVars["ContainerUpdateIDs"].moderate();
  }

  /**
   * 
   */
  registerNode(node, callback) {
    this._nodeRegistry.registerNode(node, (error) => {
      if (error) {
        return callback(error);
      }

      this.asyncEmit('newNode', node, () => callback(null, node));
    });
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {
    var upnpServer=this.upnpServer;
    if (upnpServer.logActivity && node.contentURL) {
      upnpServer.logActivity("Processed "+node.contentURL);
    }

    this._nodeRegistry.saveNode(node, modifiedProperties, (error) => {
      if (error) {
        return callback(error);
      }

      this.asyncEmit('saveNode', node, modifiedProperties, callback);
    });
  }

  /**
   * 
   */
  getNodeById(id, options, callback) {
    if (arguments.length === 2) {
      callback = options;
      options = null;
    }

    this._nodeRegistry.getNodeById(id, callback);
  }

  /**
   * 
   */
  allocateNodeId(node, callback) {
    this._nodeRegistry.allocateNodeId(node, callback);
  }

  /**
   * 
   */
  unregisterNode(node, callback) {
    this.asyncEmit('deleteNode', node, (error) => {
      if (error) {
        return callback(error);
      }

      this._nodeRegistry.unregisterNode(node, callback);
    });
  }

  /**
   * 
   */
  processRequest(request, response, path, callback) {

    this._lastRequestDate = Date.now();
    request.contentDirectoryService = this;

    var reg = /([^\/]+)(\/.*)?/.exec(path);
    if (!reg) {
      return callback("Invalid path (" + path + ")");
    }
    var segment = reg[1];
    var action = reg[2] && reg[2].slice(1);

    switch (segment) {
    case "content":
      var parameters=action.split('/');
      var nid=parameters.shift();

      var id = this._nodeRegistry.keyFromString(nid);

      debug("processRequest: Request node=", id, "requestId=",nid, "parameters=", parameters, "request=", path);

      this.getNodeById(id, (error, node) => {
        if (error) {
          logger.error("processRequest: GetNodeById id=", id, " throws error=", error);
          return callback(error);
        }

        if (!node || !node.id) {
          logger.error("Send content of node=#", id, "not found");

          this.emit("request-error", request, id);

          response.writeHead(404, 'Node #' + id + ' not found');
          response.end();
          return callback(null, true);
        }

        node.resolveLink((error, nodeRef) => {
          if (error) {
            logger.error("processRequest: ResolveLink error node=",id,"error=", error);
            return callback(error);
          }

          this.emit("request", request, nodeRef, node, parameters);

          this.processNodeContent(nodeRef, request, response, path, parameters, callback);
        });
      });
      return;

    case "tree":
      this.getNodeById(0, (error, node) => {
        if (error) {
          debug("/tree get root node returns error", error);
          return callback(error);
        }
        node.treeString((error, string) => {
          if (error) {
            debug("/tree treeString() returns error", error);
            return callback(error);
          }

          response.setHeader("Content-Type", "text/plain; charset=\"utf-8\"");
          response.end(string, "UTF8");
          callback(null, true);
        });
      });
      return;
    }

    super.processRequest(request, response, path, callback);
  }

  /**
   * 
   */
  processNodeContent(node, request, response, path, parameters, callback) {

    var contentHandlerName = parameters[0];
    if (contentHandlerName !== undefined) {
      var contentHandler = this.contentHandlersByName[contentHandlerName];

      debug("Process request: contentHandler key=", contentHandlerName); // , " handler=",contentHandler);

      if (!contentHandler) {
        logger.error('Content handler not found: ' + contentHandlerName+' for node #'+node.id);

        response.writeHead(404, 'Content handler not found: ' + contentHandlerName);
        response.end();
        return callback(null, true);
      }

      parameters.shift();

      contentHandler.processRequest(node, request, response, path, parameters, callback);
      return;
    }

    var contentURL = node.contentURL;

    if (!contentURL) {
      logger.error('Resource not found for node #',node.id);

      response.writeHead(404, 'Resource not found for node #' + node.id);
      response.end();
      return callback(null, true);
    }

    var attributes=node.attributes || {};

    this.sendContentURL({
      contentURL: contentURL,
      mtime: node.contentTime,
      hash: node.contentHash,
      size: attributes.size,
      mime: attributes.mime
    }, request, response, callback);
  }

  /**
   * 
   */
  sendContentURL(attributes, request, response, callback) {
    var contentURL=attributes.contentURL;
    debug("sendContentURL", "contentURL=",contentURL, "headers=",request.headers, "headersSent=",response.headersSent);

    var contentProvider = this.getContentProvider(contentURL);

    var fillHeader = () => {
      if (attributes.mtime) {
        var m=attributes.mtime;
        if (typeof(m)==="number") {
          m=new Date(m);
        }
        response.setHeader('Last-Modified', m.toUTCString());
      }
      if (attributes.contentHash) {
        response.setHeader('ETag', attributes.contentHash);
      }      
      if (attributes.size!==undefined) {
        response.setHeader('Content-Length', attributes.size);
      }
      if (attributes.mime!==undefined) {
        response.setHeader('Content-Type', attributes.mime);
      }
    };

    if (contentProvider.isLocalFilesystem) {
      var stream = send(request, contentURL);

      fillHeader();

      stream.pipe(response);

      stream.on('end', () => callback(null, true));
      return;
    }

    if (!attributes.mime || attributes.size===undefined) {
      contentProvider.stat(contentURL, (error, stats) => {
        if (error) {
          logger.error('Can not stat contentURL=',contentURL);

          response.writeHead(404, 'Stream not found for linked content');
          response.end();
          return callback(null, true);
        }

        attributes.mime=stats.mime;
        attributes.size=stats.size;
        attributes.mtime=stats.mtime;

        this.sendContentURL(attributes, request, response, callback);
      });
      return;
    }

    var opts={};

    var ranges = request.headers.range;
    if (ranges) {
      var rs = rangeParser(attributes.size, ranges);
      debug("sendContentURL", "RangeParser=",rs, 'ranges=',ranges, "headersSent=",response.headersSent);

      if (rs===-1) {
        debug('sendContentURL', 'range unsatisfiable rs=', rs, 'ranges=',ranges, 'size=', attributes.size);
        response.setHeader('Content-Range', 'bytes */' + attributes.size);
        response.writeHead(416, 'Range unsatisfiable');
        response.end();
        return callback(null, true);
      }

      opts.start=rs[0].start;
      opts.end=rs[0].end;

      response.setHeader('Content-Range', 'bytes '+ opts.start+'-'+opts.end+'/'+attributes.size);
      response.statusCode=206;
      response.statusMessage='Range OK';
    }

    contentProvider.createReadStream(null, contentURL, opts, (error, stream) => {
      if (error) {
        logger.error('No stream for contentURL=',contentURL);

        if (!response.headersSent) {
          response.writeHead(404, 'Stream not found for linked content');
        }
        response.end();
        return callback(null, true);
      }

      fillHeader();

      stream.pipe(response);

      stream.on('end', () => callback(null, true));
    });    
  }

//kept for Intel upnp toolkit, but not in upnp spec
  /**
   * 
   */
  _sendItemChangesEvent() {
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
  }

  /**
   * 
   */
  getContentProvider(url) {
    assert.equal(typeof(url), "string", "Invalid url parameter");

    var reg=PROTOCOL_SPLITTER.exec(url);

    var protocol=(reg && reg[1].toLowerCase()) || "file";

    var contentProvider = this._contentProvidersByProtocol[protocol];
    if (!contentProvider) {
      console.error("Can not find a contentProvider with protocol '"+protocol+"'");
      throw new Error("Unknown protocol: '"+protocol+"'");
    }

    debug("GetContentProvider of ",url,"=>", contentProvider.name);

    return contentProvider;
  }

  /**
   * 
   */
  _emitPrepare(mime, contentInfos, attributes, callback) {    
    attributes = attributes || {};

    var mainError;

    // console.log("Emit 'prepare:'" + mime+" "+node.attributes.contentURL);
    this.asyncEmit("prepare:" + mime, contentInfos, attributes, (error) => {
      if (error === false) {
        // setImmediate(callback);
        // return;
      }
      if (error) {
        mainError = error;
        // setImmediate(callback.bind(this, error));
        // return;
      }

      var mime2 = mime.split("/")[0] + "/*";

      // console.log("Emit 'prepare:'" + mime2);

      if (debugStack.enabled) {
        debugStack("prepareNodeAttributes depth=" + _stackDepth());
      }

      this.asyncEmit("prepare:" + mime2, contentInfos, attributes, (error) => {
        callback(error || mainError, attributes);
      });
    });
  }

  /**
   * 
   */
  _emitToJXML(node, attributes, request, filterCallback, xml, callback) {
    var mime = attributes.mime;
    if (!mime) {
      return callback();
    }

    var eventName = "toJXML:" + mime;

    var mime2 = mime.split("/")[0] + "/*";
    var eventName2 = "toJXML:" + mime2;

    if (!this.hasListeners(eventName) && !this.hasListeners(eventName2)) {
      return callback();
    }

    this.asyncEmit(eventName, node, attributes, request, filterCallback, xml,
        (error) => {
          if (error === false) {
            return callback();
          }

          this.asyncEmit(eventName2, node, attributes, request, filterCallback,
              xml, (error) => {
                if (error !== false) {
                  return callback(error);
                }

                callback();
              });
        });
  }

  /**
   * 
   */
  searchUpnpClass(fileInfos) {
    var list = [];

    if (fileInfos.stats) {
      if (fileInfos.stats.isDirectory()) {
        list.push({
          upnpClass : this.upnpClasses[UpnpContainer.UPNP_CLASS],
          priority : 0
        });
      }
    }

    if (fileInfos.mime) {
      var byMimeType = this.upnpClassesByMimeType;

      var upnpClasses = byMimeType[fileInfos.mime];
      if (upnpClasses) {
        upnpClasses.forEach((upnpClass) => {
          list.push({
            upnpClass : upnpClass,
            priority : 20
          });
        });
      }

      var mimeParts = fileInfos.mime.split("/");
      upnpClasses = byMimeType[mimeParts[0] + "/*"];
      if (upnpClasses) {
        upnpClasses.forEach((upnpClass) => {
          list.push({
            upnpClass : upnpClass,
            priority : 10
          });
        });
      }
    }

    var contentHandlers = this.contentHandlers;
    if (contentHandlers) {
      contentHandlers.forEach((contentHandler) => {
        var ret = contentHandler.searchUpnpClass(fileInfos);
        if (!ret || !ret.length) {
          return;
        }

        if (!Util.isArray(ret)) {
          if (ret.upnpClass) {
            list.push(ret);
          }
          return;
        }

        list = list.concat(ret);
      });
    }

    if (list.length > 1) {
      list.sort((s1, s2) => {
        var d = s2.priority - s1.priority;
        if (d) {
          return d;
        }
        return s2.upnpClass.name.length - s1.upnpClass.name.length;
      });
    }

    if (false && debug.enabled) {
      debug("searchUpnpClass: Return list=", Util.inspect(list, {
        depth : null
      }));
    }

    return list;
  }

  /**
   * 
   */
  get nodeRegistry() {
    return this._nodeRegistry;
  }

  /**
   * 
   */
  loadMetas(infos, callback) {

    var mimeType = infos.mime;
    var contentURL = infos.contentURL;
    if (!mimeType) {
      mimeType=Mime.lookup(contentURL);
    }

    var contentProvider = infos.contentProvider;
    if (!contentProvider) {
      contentProvider=this.getContentProvider(contentURL);
      infos.contentProvider=contentProvider;
    }

    var lm = (stats) => {
      var mtime=stats.mtime.getTime();

      this.nodeRegistry.getMetas(contentURL, mtime, (error, metas) => {
        debugMetas("getMetas of key=",contentURL,"mtime=",mtime,"=>",metas,"error=",error);
        if (error) {
          logger.error("Can not get metas of", contentURL, error);
        }

        if (metas) {        
          return callback(null, metas);
        }

        this._emitPrepare(mimeType, infos, {}, (error, metas) => {
          if (error) {
            logger.error("Can not compute metas of", contentURL, error);
//          return foundCallback(error);
            metas={error: true};
          }
          debugMetas("getMetas: prepare metas=>", metas);

          this.nodeRegistry.putMetas(contentURL, mtime, metas, (error1) => {
            if(error1) {
              logger.error("Can not put metas of", contentURL, error1);
            }

            callback(error || error1, metas);
          });
        });
      });
    };

    if (infos.stats) {
      return lm(infos.stats);
    }

    debugMetas("getMetas: load stats of", contentURL);

    contentProvider.stat(contentURL, (error, stats) => {
      if (error) {
        logger.error("Can not stat", contentURL, error);
        return callback(error);
      }

      infos.stats=stats;
      lm(stats);
    });
  }
}

function mimeTypeMatch(mime, chs) {

  var s1=mime.split('/');

  return chs.find((ch) => {
    var s2=ch.split('/');

    if (s2[0]!=='*' && s1[0]!==s2[0]) {
      return false;
    }

    if (s2[1]!=='*' && s1[1]!==s2[1]) {
      return false;
    }

    return true;
  });
}

function _stackDepth() {
  return new Error().stack.split("\n").length - 1;
}
function _setupContentHandlerMimeTypes(cht, handlers, mergeWildcard) {
  Object.keys(handlers).forEach((key) => {
    var handler = handlers[key];
    var mimeTypes = handler.mimeTypes;
    if (!mimeTypes) {
      return;
    }

    mimeTypes.forEach((mimeType) => {
      var cmt = cht[mimeType];
      if (!cmt) {
        cmt = [];
        cht[mimeType] = cmt;
      }

      cmt.push(handler);
    });
  });

  Object.keys(cht).forEach((mimeType4) => {
    var mts2 = cht[mimeType4];

    mts2.sort((ch1, ch2) => {
      var p1 = ch1.priority || 0;
      var p2 = ch2.priority || 0;

      return p2 - p1;
    });
  });

  if (debug.enabled) {
    for ( var mimeType5 in cht) {
      debug("Handler Mime '" + mimeType5 + "' => " + cht[mimeType5]);
    }
  }
}

function _applySortCriteria(lxml, sortCriteria) {

  if (typeof (sortCriteria) === "string") {
    sortCriteria = sortCriteria.split(',');
  }

  // console.log("Sort criteria = ", sortCriteria, " upnpClass=", node.upnpClass);

  var sortFunction = null;
  sortCriteria.forEach(function(c) {
    c=c.trim();

    var descending = (c.charAt(0) === '-');

    sortFunction = _createSortCriteria(sortFunction, c.substring(1), descending);
  });

  lxml.sort(sortFunction);
}

const ACCENTS_MAPPER = [ /[áãàâäåāăąǎǟǡǻ]/g, 'a', /[çćĉċč]/g, 'c', /[ďđ]/g, 'd',
                         /[éèêëēĕėęěǝǯ]/g, 'e', /[ĝğġģǥǧǵ]/g, 'g', /[ĥħ]/g, 'h', /[íìîïĩīĭįıǐ]/g,
                         'i', /[ĵǰ]/g, 'j', /[ķǩ]/g, 'k', /[ĺļľŀł]/g, 'l', /[ñńņňŉŋǹ]/g, 'n',
                         /[óõòôöōŏőǒǫǭǿ]/g, 'o', /[ŕŗř]/g, 'r', /[śŝşš]/g, 's', /[ţťŧ]/g, 't',
                         /[úùûüµǔǖǘǚǜ]/g, 'u', /[ýÿ]/g, 'y', /[źżžƶ]/g, 'z', /[œ]/g, 'oe', /[æǽǣ]/g,
                         'ae', /[ĳ]/g, 'ij', /[ǳǆ]/g, 'dz', /[ǉ]/g, 'lj', /[ǌ]/g, 'nj' ];

function normalizeAlpha(s) {
  if (typeof (s) !== "string") {
    return s;
  }
  s = s.toLowerCase().trim();

  for (var i = 0; i < ACCENTS_MAPPER.length;) {
    var expr = ACCENTS_MAPPER[i++];
    var code = ACCENTS_MAPPER[i++];

    s = s.replace(expr, code);
  }

  return s;
}

function _createSortCriteria(func, criteria, descending) {
  return (x1, x2) => {
    if (func) {
      var ret = func(x1, x2);
      if (ret) {
        return ret;
      }
    }

    var n1 = _getNodeContent(x1, criteria, descending);
    var n2 = _getNodeContent(x2, criteria, descending);

    // console.log("Compare ", n1, "<>", n2, " ", descending);

    n1 = normalizeAlpha(n1);
    n2 = normalizeAlpha(n2);

    if (n1 < n2) {
      return (descending) ? 1 : -1;
    }
    if (n1 > n2) {
      return (descending) ? -1 : 1;
    }

    return 0;
  };
}

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

module.exports = ContentDirectoryService;
