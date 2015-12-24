/*jslint node: true, nomen: true */
"use strict";

// IT MUST START AT 0 because UPNP ROOT must have id 0
var nodeIndex = 1;

var MemoryRegistry = function() {
};

module.exports = MemoryRegistry;

MemoryRegistry.prototype.initialize = function(service, callback) {
  this._dbMap = {};
  this._count = 0;
  this._service = service;

  return callback(null);
};

MemoryRegistry.prototype.keyFromString = function(key) {
  return parseInt(key, 10);
};

MemoryRegistry.prototype.clear = function(callback) {
  this._dbMap = {};
  this._count = 0;

  return callback(null);
};

MemoryRegistry.prototype.registerNode = function(node, callback) {
  this._dbMap[node.id] = node;
  this._count++;

  return callback(null, node);
};

MemoryRegistry.prototype.saveNode = function(node, modifiedProperties, callback) {
  return callback(null, node);
};

MemoryRegistry.prototype.getNodeById = function(id, callback) {
  var node = this._dbMap[id];

  setImmediate(function() {
    callback(null, node);
  });
};

MemoryRegistry.prototype.unregisterNode = function(node, callback) {
  var id = node.id;
  delete this._dbMap[id];
  this._count--;

  return callback(null);
};

MemoryRegistry.prototype.allocateNodeId = function(callback) {
  callback(null, nodeIndex++);
};
