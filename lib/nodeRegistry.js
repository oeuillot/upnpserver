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

Registry.prototype.registerNode = function(item, callback) {
  this._dbMap[item.id] = item;

  return callback(null, item);
};

Registry.prototype.getNodeById = function(id, callback) {
  var item = this._dbMap[id];

  setImmediate(function() {
    callback(null, item);
  });
};

Registry.prototype.removeItemById = function(id, callback) {
  delete this._dbMap[id];

  return callback(null);
};
