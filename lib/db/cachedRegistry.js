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

    var garbage = (node, key, infos) => {
      debug("intialize.garbage", "Garbage node #", node.id, infos.readCount);   

      var sem = node._isLocked();
      if (sem !== false) {
        debug("intialize.garbage", "Not releasable #", node.id, "locked by semaphore=", sem);
        this._map.put(node, node);
        return;
      }

      if (this._garbageNode) {
        this._garbageNode(node);
      }
    };

    this._map = new NodeWeakHashmap("nodeById", CACHE_DELAY_MS, false, garbage);

    debug("intialize", "CachedRegistry initialized");

    super.initialize(service, callback);
  }

  /**
   * 
   */
  clear(callback) {
    this._map.clear();

    debug("clear", "Clear all registry");

    callback(null);
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {
    this._map.put(node, node);

    debug("saveNode", "Put in cache node #", node.id);

    callback(null, node);
  }

  /**
   * 
   */
  getNodeById(id, callback) {
    var node = this._map.get(id);

    debug("getNodeById", "Find node #", id, "=>", !!node);

    callback(null, node);
  }

  /**
   * 
   */
  unregisterNode(node, callback) {
    this._map.remove(node);

    debug("unregisterNode", "Unregister node #", node.id);

    callback(null, node);
  }
}

module.exports = CachedRegistry;
