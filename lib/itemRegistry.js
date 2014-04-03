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

Registry.prototype.registerItem = function(item, callback) {
  this._dbMap[item.id] = item;

  return callback(null, item);
};

Registry.prototype.getItemById = function(id, callback) {
  var item = this._dbMap[id];

  process.nextTick(function() {
    callback(null, item)
  });
};
