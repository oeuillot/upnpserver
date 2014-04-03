/*jslint node: true, plusplus:true */
"use strict";

var mime = require('mime');
var path = require('path');
var fs = require('fs');

var Repository = function(repositoryId, mountPath, searchClasses) {
  this.repositoryId = repositoryId;

  if (!mountPath) {
    mountPath = "";
  }
  if (mountPath.charAt(0) !== '/') {
    mountPath = "/" + mountPath;
  }
  this.mountPath = mountPath;

};

module.exports = Repository;

Repository.prototype.initialize = function(service, callback) {
  this.contentDirectoryService = service;

  service.allocateItemsForPath(this.mountPath, callback);
};

Repository.prototype.browse = function(list, item, callback) {
  return callback(null);
};

Repository.prototype.update = function(item, callback) {
  return callback(null);
};
