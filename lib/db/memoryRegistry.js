/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const AbstractRegistry = require('./abstractRegistry');

//IT MUST START AT 0 because UPNP ROOT must have id 0
var nodeIndex = 1;

class MemoryRegistry extends AbstractRegistry {

  /**
   * 
   */
  initialize(service, callback) {
    this._dbMap = {};
    this._count = 0;

    super.initialize(service, callback);
  }

  /**
   * 
   */
  keyFromString(key) {
    return parseInt(key, 10);
  }

  /**
   * 
   */
  clear(callback) {
    this._dbMap = {};
    this._count = 0;

    return callback(null);
  }

  /**
   * 
   */
  registerNode(node, callback) {
    this._dbMap[node.id] = node;
    this._count++;

    return callback(null, node);
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {
    return callback(null, node);
  }

  /**
   * 
   */
  getNodeById(id, callback) {
    var node = this._dbMap[id];

    setImmediate(function() {
      callback(null, node);
    });
  }

  /**
   * 
   */
  unregisterNode(node, callback) {
    var id = node.id;
    delete this._dbMap[id];
    this._count--;

    return callback(null);
  }

  /**
   * 
   */
  allocateNodeId(callback) {
    callback(null, nodeIndex++);
  }
}

module.exports = MemoryRegistry;
