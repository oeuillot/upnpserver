/*jslint node: true, esversion: 6 */
"use strict";

const Async = require('async');
const Util = require('util');
const debug = require('debug')('upnpserver:repositories:History');

const logger = require('../logger');
const Repository = require('./repository');

var TYPE_BY_CLASS = {
    "object.item.videoItem" : "videos",
    "object.item.audioItem" : "tracks",
    "object.item.imageItem" : "images",
    "object.container.album.musicAlbum" : "albums"
};

class HistoryRepository extends Repository {
  constructor(id, mountPath, path, perHostHistorySize, allHostHistorySize) {
    super(id, mountPath);

    if (!perHostHistorySize || perHostHistorySize < 0) {
      perHostHistorySize = 4;
    }
    if (!allHostHistorySize || allHostHistorySize < 0) {
      allHostHistorySize = 4;
    }

    this.perHostHistorySize = perHostHistorySize;
    this.allHostHistorySize = allHostHistorySize;

    this._folders = {};
  }

  /**
   * 
   */
  initialize(service, callback) {

    service.on("BrowseDirectChildren", (request, node) => {

      var nodeType = this._getNodeType(node);

      if (debug.enabled) {
        debug("BrowseDirectChildren node=#", node.id, " => nodeType=", nodeType);
      }
      if (!nodeType) {
        return;
      }

      var clientId = this._getClientId(request);
      if (debug.enabled) {
        debug("Request clientId=", clientId, " for request ", request);
      }
      if (!clientId) {
        return;
      }

      setTimeout(() => {
        this._registerNewRef(nodeType, node, clientId, (error) => {
          if (error) {
            console.error(error);
            return;
          }

        });
      }, 100);
    });

    service.on("request", (request, nodeRef, node, parameters) => {

      if (parameters.contentHandler) {
        return;
      }

      var nodeType = this._getNodeType(nodeRef);

      if (debug.enabled) {
        debug("Request ref=#", nodeRef.id, " node=#", node.id, " => nodeType=",
            nodeType);
      }
      if (!nodeType) {
        return;
      }

      var clientId = this._getClientId(request);
      if (debug.enabled) {
        debug("Request clientId=", clientId, " for request ", request);
      }
      if (!clientId) {
        return;
      }

      setTimeout(() => {
        this._registerNewRef(nodeType, node, clientId, (error) => {
          if (error) {
            console.error(error);
            return;
          }

        });
      }, 100);
    });

    service.on("filterList", (request, node, list) => {

      if (node.id !== this._mountNode.id) {
        return;
      }

      var clientId = this._getClientId(request);
      if (debug.enabled) {
        debug("Filter list of mount node #", this._mountNode.id, " clientId=",
            clientId);
      }

      if (!clientId) {
        return;
      }

      for (var i = 0; i < list.length;) {
        var n = list[i];
        var nClientId = n.attributes && n.attributes.clientId;
        if (!nClientId) {
          i++;
          continue;
        }

        if (nClientId === clientId) {
          i++;
          continue;
        }

        if (debug.enabled) {
          debug("Remove clientId", nClientId, "from list");
        }

        list.splice(i, 1);
      }
    });

    var i18n = service.upnpServer.configuration.i18n;

    super.initialize(service, (error, node) => {
      if (error) {
        return callback(error);
      }

      this._mountNode = node;

      this.newVirtualContainer(node, i18n.ALL_DEVICES, (error, allNode) => {
        if (error) {
          return callback(error);
        }

        this._allNode = allNode;

        this._declareFolders(allNode, "*", (error) => {
          if (error) {
            return callback(error);
          }

          callback(null, node);
        });
      });
    });
  }

  /**
   *
   */
  _declareFolders(parentNode, clientId, callback) {

    var fs = this._folders[clientId];
    if (fs) {
      return callback(null, fs);
    }

    fs = {};
    this._folders[clientId] = fs;

    debug("Create folders on #" + parentNode.id);

    var i18map = {
        tracks : "TRACKS_FOLDER",
        albums : "ALBUMS_FOLDER",
        videos : "VIDEOS_FOLDER",
        images : "IMAGES_FOLDER"
    };

    var i18n = this.service.upnpServer.configuration.i18n;

    Async.eachSeries([ 'tracks', 'albums', 'videos', 'images' ], (type, callback) => {

      var label = i18n[i18map[type]];

      this.newVirtualContainer(parentNode, label, (error, node) => {
        if (error) {
          debug("_declareFolders: newVirtualContainer parentNode=",
              parentNode.id, " label=", label, " error=", error);
          return callback(error);
        }

        fs[type] = node;
        node.attributes.clientId = clientId;
        node.attributes.defaultSort = "-dc:date";

        callback(null, node);
      });
    }, callback);
  }

  _getClientId(request) {
    var headers = request.headers;
    var xForwardedFor = headers["x-forwarded-for"] ||
    headers["x-cluster-client-ip"] || headers["x-real-ip"];
    if (xForwardedFor) {
      return xForwardedFor;
    }

    var remoteAddress = request.connection.remoteAddress ||
    request.socket.remoteAddress || request.connection.socket.remoteAddress;

    return remoteAddress || "Inconnu"; // TODO Unknown
  }

  _getNodeType(node) {
    var clazz = node.upnpClass;
    if (!clazz) {
      debug("Class=NULL ? #", node.id);
      return null;
    }

    debug("Class=", clazz, clazz && clazz.name);

    var cname = clazz.name;

    for ( var k in TYPE_BY_CLASS) {
      if (cname.indexOf(k)) {
        continue;
      }

      debug("Found ", cname, " => ", k, " ", TYPE_BY_CLASS[k]);

      return TYPE_BY_CLASS[k];
    }

    debug("Not found", cname, "?");

    return null;
  }

  _registerNewRef(nodeType, node,
      clientId, callback) {

    this._declareFolders(this._mountNode, clientId, (error, folderNode) => {
      if (error) {
        return callback(error);
      }

      var parent = this._folders[clientId][nodeType];
      if (!parent) {
        return callback();
      }

      this._removeNodeRef(parent, node, this.perHostHistorySize, (error) => {
        if (error) {
          return callback(error);
        }

        this.newNodeRef(parent, node, null, (newNode) => {

          newNode.attributes = newNode.attributes || {};
          newNode.attributes.date = Date.now();
          
        }, (error, newNode) => {
          if (error) {
            return callback(error);
          }

          this._declareFolders(this._allNode, "*", (error, folderNode) => {
            if (error) {
              return callback(error);
            }

            var parent = this._folders["*"][nodeType];
            if (!parent) {
              return callback();
            }

            this._removeNodeRef(parent, node, this.allHostHistorySize, (error) => {
                  if (error) {
                    return callback(error);
                  }

                  this.newNodeRef(parent, node, null, (newNode) => {

                    newNode.attributes = newNode.attributes || {};
                    newNode.attributes.date = Date.now();
                    
                  }, callback);
                });
          });
        });
      });
    });
  }

  _removeNodeRef(parent, nodeRef,
      maxListSize, callback) {

    parent.listChildren((error, list) => {
      if (error) {
        return callback(error);
      }

      // console.log("List of #", parent.id, "=>", list);

      var cnt = 0;

      Async.eachSeries(list, (node, callback) => {
        cnt++;

        // debug("Test node=", node);
        if (!node) {
          debug("WARNING !!!! node is null ???");
          return callback();
        }

        if (node.refId !== nodeRef.id && (!maxListSize || cnt < maxListSize)) {
          return callback();
        }

        // debug("Remove already referenced node ! #" + node.id);

        parent.removeChild(node, callback);
      }, callback);
    });
  }
}

module.exports = HistoryRepository;
