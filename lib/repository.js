/*jslint node: true, plusplus:true */
"use strict";

var assert = require('assert');
var Mime = require('mime');
var Path = require('path');
var Uuid = require('node-uuid');
var util = require('util');

var debug = require('debug')('upnpserver:repository');

var Item = require('./class/object.item');
var Container = require('./class/object.container');

var VIRTUAL_CONTAINER = {
  virtual : true
};

var Repository = function(repositoryId, mountPath, searchClasses) {
  this.repositoryId = repositoryId || Uuid.v4();

  if (!mountPath) {
    mountPath = "";
  }
  if (mountPath.charAt(0) !== '/') {
    mountPath = "/" + mountPath;
  }
  this.mountPath = mountPath;

};

Repository.UPNP_CLASS_UNKNOWN = "UpnpClassUnknown";

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

function computeDate(t) {
  if (t.getFullYear() >= 1970) {
    return t.getTime();
  }

  return t;
}

Repository.prototype.newFile = function(parent, path, upnpClass, stats,
    attributes, before, callback) {

  if (arguments.length === 6 && typeof (before) === "function") {
    callback = before;
    before = null;
  }

  if (typeof (callback) !== "function") {
    throw new Error("Invalid callback parameter");
  }

  if (!attributes) {
    attributes = {};
  }

  var self = this;
  function processStats(stats) {
    if (!attributes.date && stats.mtime) {
      attributes.date = computeDate(stats.mtime);
    }

    attributes.mime = attributes.mime || stats.mime;

    if (!upnpClass) {

      var byMimeType = self.contentDirectoryService.upnpClassesByMimeType;

      var upnpClasses = byMimeType[attributes.mime];

      upnpClass = accept(upnpClasses, path, attributes, stats);

      if (!upnpClass) {
        var mimeParts = attributes.mime.split("/");

        upnpClasses = byMimeType[mimeParts[0] + "/*"];

        upnpClass = accept(upnpClasses, path, attributes, stats);
      }

      if (false && debug.enabled) {
        debug("Mime ", byMimeType, " ", attributes.mime, upnpClass);
      }
    }

    if (!upnpClass) {
      return callback({
        code : Repository.UPNP_CLASS_UNKNOWN
      });
    }

    return self.contentDirectoryService.newFile(parent, path, upnpClass, stats,
        attributes, before, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  this.contentDirectoryService.getContentProvider(path).stat(path,
      function(error, stats) {
        if (error) {
          return callback(error);
        }

        return processStats(stats);
      });
};

function accept(upnpClasses, path, attributes, stats) {
  if (!upnpClasses) {
    return null;
  }

  for (var i = 0; i < upnpClasses.length; i++) {
    var upnpClass = upnpClasses[i];

    if (typeof (upnpClass.acceptFile) === "function" &&
        upnpClass.acceptFile(path, attributes, stats) === false) {
      continue;
    }

    return upnpClass;
  }

  return null;
}

Repository.prototype.newFolder = function(parent, path, upnpClass, stats,
    attributes, before, callback) {

  if (arguments.length === 6 && typeof (before) === "function") {
    callback = before;
    before = null;
  }

  assert(typeof (callback) === "function", "Invalid callback parameter");

  if (!upnpClass) {
    upnpClass = Container.UPNP_CLASS;
  }

  var name = Path.basename(path);

  attributes = attributes || {};
  attributes.realpath = path;

  var self = this;
  function processStats(stats) {
    attributes.date = stats.mtime;

    return self.contentDirectoryService.newContainer(parent, name, upnpClass,
        attributes, before, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  this.contentDirectoryService.getContentProvider(path).stat(path,
      function(error, stats) {
        if (error) {
          return callback(error);
        }

        return processStats(stats);
      });
};

Repository.prototype.newVirtualContainer = function(parent, path, upnpClass,
    attributes, before, callback) {

  if (arguments.length === 5 && typeof (before) === "function") {
    callback = before;
    before = null;
  }

  assert(typeof (callback) === "function", "Invalid callback parameter");

  if (!attributes) {
    attributes = {};
  }

  if (!upnpClass) {
    upnpClass = Item.CONTAINER;
  }

  attributes.virtual = true;

  // (parent, name, upnpClass, virtual, attributes, callback
  this.contentDirectoryService.newContainer(parent, path, upnpClass,
      attributes, before, callback);
};

Repository.prototype.newItemRef = function(parent, targetItem, name, before,
    callback) {

  if (arguments.length === 4 && typeof (before) === "function") {
    callback = before;
    before = null;
  }

  this.contentDirectoryService.newNodeRef(parent, targetItem, name, before,
      callback);
};
