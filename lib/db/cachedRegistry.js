/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const NodeWeakHashmap = require('../util/nodeWeakHashmap');
const debug = require('debug')('upnpserver:db:cachedRegistry');

const AbstractRegistry = require('./abstractRegistry');

const CACHE_DELAY_MS = 1000 * 10;

class CachedRegistry extends AbstractRegistry {

  /**
   * 
   */
  initialize(service, callback) {

    var garbage = (node) => {
      debug("Garbage node #", node.id);   

      var sem = node._isLocked();
      if (sem !== false) {
        debug("Not releasable #", node.id, "locked by semaphore=", sem);
        this._map.put(node, node);
        return;
      }

      if (this._garbageNode) {
        this._garbageNode(node);
      }
    };

    this._map = new NodeWeakHashmap("nodeById", CACHE_DELAY_MS, false, garbage);

    debug("CachedRegistry initialized");

    super.initialize(service, callback);
  }

  /**
   * 
   */
  clear(callback) {
    this._map.clear();

    debug("Clear all registry");

    callback(null);
  }

  /**
   * 
   */
  registerNode(node, callback) {
    this.saveNode(node, null, callback);
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {
    this._map.put(node, node);

    debug("Put in cache node #", node.id);

    callback(null, node);
  }

  /**
   * 
   */
  getNodeById(id, callback) {
    var node = this._map.get(id);

    debug("Find node #", id, "=>", !!node);

    callback(null, node);
  }

  /**
   * 
   */
  unregisterNode(node, callback) {
    this._map.put(node, undefined);

    debug("Unregister node #", node.id);

    callback(null, node);
  }
}

module.exports = CachedRegistry;
