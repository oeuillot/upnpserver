/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Async = require('async');
var Util = require('util');
var debug = require('debug')('device:historyRepository');
var assert = require('assert');
var logger = require('../logger');
var Repository = require('./repository');

var TYPE_BY_CLASS = {
  "object.item.videoItem" : "videos",
  "object.item.audioItem" : "tracks",
  "object.item.imageItem" : "images",
  "object.container.album.musicAlbum" : "albums"
};
// repositoryId, mountPoint, path, perHostHistorySize, allHostHistorySize
var HistoryRepository = function(configuration) {

  assert(typeof configuration.mountPoint === "string", "Invalid mountPoint parameter '" +
      configuration.mountPoint +
      "'");

  var allHostHistorySize    = configuration.allHostHistorySize;
  var perHostHistorySize    = configuration.perHostHistorySize;

  Repository.call(this, configuration);

  if (!perHostHistorySize || perHostHistorySize < 0) {
    perHostHistorySize = 4;
  }
  if (!allHostHistorySize || allHostHistorySize < 0) {
    allHostHistorySize = 4;
  }

  this.perHostHistorySize = perHostHistorySize;
  this.allHostHistorySize = allHostHistorySize;

  this._folders = {};
};

Util.inherits(HistoryRepository, Repository);

module.exports = HistoryRepository;

HistoryRepository.prototype.initialize = function(service, callback) {

  var self = this;

  service.on("BrowseDirectChildren", function(request, node) {

    var nodeType = self._getNodeType(node);

    if (debug.enabled) {
      debug("BrowseDirectChildren node=#", node.id, " => nodeType=", nodeType);
    }
    if (!nodeType) {
      return;
    }

    var clientId = self._getClientId(request);
    if (debug.enabled) {
      debug("Request clientId=", clientId, " for request ", request);
    }
    if (!clientId) {
      return;
    }

    setTimeout(function() {
      self._registerNewRef(nodeType, node, clientId, function(error) {
        if (error) {
          console.error(error);
          return;
        }

      });
    }, 100);
  });

  service.on("request", function(request, nodeRef, node, parameters) {

    if (parameters.contentHandler) {
      return;
    }

    var nodeType = self._getNodeType(nodeRef);

    if (debug.enabled) {
      debug("Request ref=#", nodeRef.id, " node=#", node.id, " => nodeType=",
          nodeType);
    }
    if (!nodeType) {
      return;
    }

    var clientId = self._getClientId(request);
    if (debug.enabled) {
      debug("Request clientId=", clientId, " for request ", request);
    }
    if (!clientId) {
      return;
    }

    setTimeout(function() {
      self._registerNewRef(nodeType, node, clientId, function(error) {
        if (error) {
          console.error(error);
          return;
        }

      });
    }, 100);
  });

  service.on("filterList", function(request, node, list) {

    if (node.id !== self._mountNode.id) {
      return;
    }

    var clientId = self._getClientId(request);
    if (debug.enabled) {
      debug("Filter list of mount node #", self._mountNode.id, " clientId=",
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

  var i18n = service.device.configuration.i18n;

  Repository.prototype.initialize.call(this, service, function(error, node) {
    if (error) {
      return callback(error);
    }

    self._mountNode = node;

    self.newVirtualContainer(node, i18n.ALL_DEVICES, function(error, allNode) {
      if (error) {
        return callback(error);
      }

      self._allNode = allNode;

      self._declareFolders(allNode, "*", function(error) {
        if (error) {
          return callback(error);
        }

        callback(null, node);
      });
    });
  });
};

HistoryRepository.prototype._declareFolders = function(parentNode, clientId,
    callback) {

  var fs = this._folders[clientId];
  if (fs) {
    return callback(null, fs);
  }

  fs = {};
  this._folders[clientId] = fs;

  debug("Create folders on #" + parentNode.id);

  var self = this;

  var i18map = {
    tracks : "TRACKS_FOLDER",
    albums : "ALBUMS_FOLDER",
    videos : "VIDEOS_FOLDER",
    images : "IMAGES_FOLDER"
  };

  var i18n = this.service.device.configuration.i18n;

  Async.eachSeries([ 'tracks', 'albums', 'videos', 'images' ], function(type,
      callback) {

    var label = i18n[i18map[type]];

    self.newVirtualContainer(parentNode, label, function(error, node) {
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
};

HistoryRepository.prototype._getClientId = function(request) {
  var headers = request.headers;
  var xForwardedFor = headers["x-forwarded-for"] ||
      headers["x-cluster-client-ip"] || headers["x-real-ip"];
  if (xForwardedFor) {
    return xForwardedFor;
  }

  var remoteAddress = request.connection.remoteAddress ||
      request.socket.remoteAddress || request.connection.socket.remoteAddress;

  return remoteAddress || "Inconnu"; // TODO Unknown
};

HistoryRepository.prototype._getNodeType = function(node) {
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
};

HistoryRepository.prototype._registerNewRef = function(nodeType, node,
    clientId, callback) {
  var self = this;

  this._declareFolders(this._mountNode, clientId, function(error, folderNode) {
    if (error) {
      return callback(error);
    }

    var parent = self._folders[clientId][nodeType];
    if (!parent) {
      return callback();
    }

    self._removeNodeRef(parent, node, self.perHostHistorySize, function(error) {
      if (error) {
        return callback(error);
      }

      self.newNodeRef(parent, node, function(error, newNode) {
        if (error) {
          return callback(error);
        }

        newNode.attributes = newNode.attributes || {};
        newNode.attributes.date = Date.now();

        self._declareFolders(self._allNode, "*", function(error, folderNode) {
          if (error) {
            return callback(error);
          }

          var parent = self._folders["*"][nodeType];
          if (!parent) {
            return callback();
          }

          self._removeNodeRef(parent, node, self.allHostHistorySize, function(
              error) {
            if (error) {
              return callback(error);
            }

            self.newNodeRef(parent, node, function(error, newNode) {
              if (error) {
                return callback(error);
              }

              newNode.attributes = newNode.attributes || {};
              newNode.attributes.date = Date.now();

              callback();
            });
          });
        });
      });
    });
  });
};

HistoryRepository.prototype._removeNodeRef = function(parent, nodeRef,
    maxListSize, callback) {
  var self = this;

  parent.listChildren(function(error, list) {
    if (error) {
      return callback(error);
    }

    // console.log("List of #", parent.id, "=>", list);

    var cnt = 0;

    Async.eachSeries(list, function(node, callback) {
      cnt++;

      // debug("Test node=", node);
      if (!node) {
        debug("WARNING !!!! node is null ???");
        return callback();
      }

      if (node.refID !== nodeRef.id && (!maxListSize || cnt < maxListSize)) {
        return callback();
      }

      // debug("Remove already referenced node ! #" + node.id);

      parent.removeChild(node, callback);
    }, callback);
  });
};
