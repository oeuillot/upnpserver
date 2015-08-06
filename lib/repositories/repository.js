/*jslint node: true, plusplus:true */
"use strict";

var assert = require('assert');
var Mime = require('mime');
var Path = require('path');
var Uuid = require('node-uuid');
var util = require('util');

var debug = require('debug')('upnpserver:repository');

var Node = require('../node');
var UpnpContainer = require('../class/object.container');

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

  var self = this;
  service.allocateItemsForPath(this.mountPath, function(error, node) {
    if (error) {
      return callback(error);
    }

    self._installListeners(service);

    callback(null, node);
  });
};

Repository.prototype._installListeners = function(service) {
  var self = this;

  if (this.browse) {
    service.asyncOn("browse", function(list, node) {
      var callback = arguments[arguments.length - 1];

      self.browse(list, node, callback);
    });
  }

  if (this.update) {
    service.asyncOn("update", function(node) {
      var callback = arguments[arguments.length - 1];

      self.update(node, callback);
    });
  }
};
/*
 * Repository.prototype.browse = function(list, node, callback) { return callback(null); };
 */
/*
 * Repository.prototype.update = function(node, callback) { return callback(null); };
 */

function computeDate(t) {
  if (t.getFullYear() >= 1970) {
    return t.getTime();
  }

  return t;
}

Repository.prototype._fillAttributes = function(attributes, stats) {
  if (!this.contentDirectoryService.upnpServer.configuration.strict &&
      !attributes.size) {
    attributes.size = stats.size;
  }

  if (stats.mime) {
    attributes.mime = stats.mime;
  }

  Repository.fillDates(attributes, stats);
};

Repository.fillDates=function(attributes, stats) {
  var mtime = stats.mtime;
  if (mtime) {
    if (mtime.getFullYear() >= 1970) {
      attributes.modifiedTime = mtime.getTime();
    } else {
      attributes.modifiedTime = mtime;
    }
  }
  var ctime = stats.ctime;
  if (ctime) {
    if (ctime.getFullYear() >= 1970) {
      attributes.changeTime = ctime.getTime();
    } else {
      attributes.changeTime = ctime;
    }
  }
  var atime = stats.atime;
  if (atime) {
    if (atime.getFullYear() >= 1970) {
      attributes.accessTime = atime.getTime();
    } else {
      attributes.accessTime = atime;
    }
  }
  var birthtime = stats.birthtime;
  if (birthtime && (!mtime || birthtime.getTime()<mtime.getTime())) {
    // birthtime can be after mtime ??? OS problem ???
    
    if (birthtime.getFullYear() >= 1970) {
      attributes.birthTime = birthtime.getTime();
    } else {
      attributes.birthTime = birthtime;
    }
  }
};

Repository.prototype.newFile = function(parentNode, contentURL, upnpClass,
    stats, attributes, before, callback) {

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = stats;
    stats = undefined;
    break;
  case 5:
    callback = attributes;
    attributes = undefined;
    break;
  case 6:
    callback = before;
    before = undefined;
    break;
  }

  assert(parentNode instanceof Node, "Invalid parentNode parameter (" +
      parentNode + ")");
  assert(typeof (contentURL) === "string", "Invalid contentURL parameter (" +
      contentURL + ")");
  assert(typeof (callback) === "function", "Invalid callback parameter (" +
      callback + ")");

  var name = contentURL;
  var ret = /.*\/([^/]+)/g.exec(name);
  name = (ret && ret[1]) || name;

  attributes = attributes || {};
  attributes.contentURL = contentURL;

  var self = this;
  function processStats(stats) {
    self._fillAttributes(attributes, stats);

    // console.log(contentURL, attributes);

    if (!upnpClass && attributes.mime) {
      var byMimeType = self.contentDirectoryService.upnpClassesByMimeType;

      var upnpClasses = byMimeType[attributes.mime];

      upnpClass = accept(upnpClasses, contentURL, attributes, stats);

      if (!upnpClass) {
        var mimeParts = attributes.mime.split("/");

        upnpClasses = byMimeType[mimeParts[0] + "/*"];

        upnpClass = accept(upnpClasses, contentURL, attributes, stats);
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

    return self.contentDirectoryService.newNode(parentNode, name, upnpClass,
        attributes, before, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  this.contentDirectoryService.getContentProvider(contentURL).stat(contentURL,
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

Repository.prototype.newFolder = function(parentNode, contentURL, upnpClass,
    stats, attributes, before, callback) {

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = stats;
    stats = undefined;
    break;
  case 5:
    callback = attributes;
    attributes = undefined;
    break;
  case 6:
    callback = before;
    before = undefined;
    break;
  }

  assert(parentNode instanceof Node, "Invalid parentNode parameter (" +
      parentNode + ")");
  assert(typeof (contentURL) === "string", "Invalid contentURL parameter (" +
      contentURL + ")");
  assert(typeof (callback) === "function", "Invalid callback parameter (" +
      callback + ")");

  var name = contentURL;
  var ret = /.*\/([^/]+)/g.exec(name);
  name = (ret && ret[1]) || name;

  attributes = attributes || {};
  attributes.contentURL = contentURL;

  upnpClass = upnpClass || UpnpContainer.UPNP_CLASS;

  var self = this;
  function processStats(stats) {
    self._fillAttributes(attributes, stats);

    return self.contentDirectoryService.newNode(parentNode, name, upnpClass,
        attributes, before, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  this.contentDirectoryService.getContentProvider(contentURL).stat(contentURL,
      function(error, stats) {
        if (error) {
          return callback(error);
        }

        return processStats(stats);
      });
};

Repository.prototype.newVirtualContainer = function(parentNode, name,
    upnpClass, attributes, before, callback) {

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = attributes;
    attributes = undefined;
    break;
  case 5:
    callback = before;
    before = undefined;
    break;
  }

  assert(parentNode instanceof Node, "Invalid parentNode parameter (" +
      parentNode + ")");
  assert(typeof (name) === "string", "Invalid name parameter (" + name + ")");
  assert(typeof (callback) === "function", "Invalid callback parameter (" +
      callback + ")");

  if (!attributes) {
    attributes = {};
  }

  attributes.virtual = true;

  upnpClass = upnpClass || UpnpContainer.UPNP_CLASS;

  this.contentDirectoryService.newNode(parentNode, name, upnpClass, attributes,
      before, callback);
};

Repository.prototype.newNodeRef = function(parentNode, targetNode, name,
    before, callback) {

  switch (arguments.length) {
  case 3:
    callback = name;
    name = undefined;
    break;
  case 4:
    callback = before;
    before = undefined;
    break;
  }

  assert(parentNode instanceof Node, "Invalid parentNode parameter");
  assert(targetNode instanceof Node, "Invalid targetNode parameter");
  assert(typeof (callback) === "function", "Invalid callback parameter");

  this.contentDirectoryService.newNodeRef(parentNode, targetNode, name, before,
      callback);
};
