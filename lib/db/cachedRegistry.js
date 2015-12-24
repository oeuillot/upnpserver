/*jslint node: true, nomen: true */
"use strict";

var NodeWeakHashmap = require('../util/nodeWeakHashmap');
var debug = require('debug')('upnpserver:db:cachedRegistry');

var CACHE_DELAY_MS = 1000 * 10;

var CachedRegistry = function() {
};

module.exports = CachedRegistry;

CachedRegistry.prototype.keyFromString = function(key) {
  return key;
};

CachedRegistry.prototype.initialize = function(service, callback) {
  this._service = service;

  var self = this;

  function garbage(node) {
    debug("Garbage node #", node.id);

    var sem = node._isReleasable();
    if (sem !== true) {
      debug("Not releasable #", node.id, "semaphore=", sem);
      self._map.put(node, node);
      return;
    }

    if (self._garbageNode) {
      self._garbageNode.call(self, node);
    }
  }

  this._map = new NodeWeakHashmap("nodeById", CACHE_DELAY_MS, false, garbage);

  debug("CachedRegistry initialized");

  return callback(null);
};

CachedRegistry.prototype.clear = function(callback) {
  this._map.clear();

  debug("Clear all registry");

  callback(null);
};

CachedRegistry.prototype.registerNode = function(node, callback) {
  this.saveNode(node, null, callback);
};

CachedRegistry.prototype.saveNode = function(node, modifiedProperties, callback) {
  this._map.put(node, node);

  debug("Put in cache node #", node.id);

  callback(null, node);
};

CachedRegistry.prototype.getNodeById = function(id, callback) {
  var node = this._map.get(id);

  debug("Find node #", id, "=>", !!node);

  callback(null, node);
};

CachedRegistry.prototype.unregisterNode = function(node, callback) {
  this._map.put(node, undefined);

  debug("Unregister node #", node.id);

  callback(null, node);
};
