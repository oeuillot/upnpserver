/*jslint node: true, nomen: true */
"use strict";

var Registry = function() {
};

module.exports = Registry;

Registry.prototype.initialize = function(service, callback) {
  this._dbMap = {};
  this._service = service;

  return callback(null);
};

Registry.prototype.clear = function(callback) {
  this._dbMap = {};

  return callback(null);
};

Registry.prototype.registerNode = function(node, callback) {
  this._dbMap[node.id] = node;

  return callback(null, node);
};

Registry.prototype.getNodeById = function(id, callback) {
  var node = this._dbMap[id];

  setImmediate(function() {
    callback(null, node);
  });
};

Registry.prototype.removeNodeById = function(id, callback) {
  delete this._dbMap[id];

  return callback(null);
};
