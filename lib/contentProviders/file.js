/*jslint node: true, nomen: true */
"use strict";

var Util = require('util');
var Mime = require('mime');
var fs = require('fs');
var Path = require('path');

var debug = require('debug')('upnpserver:contentProvider:file');
var logger = require('../logger');

var ContentProvider = require('./contentProvider');

var DIRECTORY_MIME_TYPE = "application/x-directory";

function FileContentProvider(API, parameters) {
  ContentProvider.call(this, API, parameters);
}

Util.inherits(FileContentProvider, ContentProvider);

module.exports = FileContentProvider;

ContentProvider.prototype.readdir = function(basePath, callback) {

  fs.readdir(basePath, function(error, files) {
    if (error) {
      return callback(error);
    }

    for (var i = 0; i < files.length; i++) {
      files[i] = basePath + Path.sep + files[i];
    }

    if (debug.enabled) {
      debug("readdir('" + basePath + "' returns", files);
    }

    return callback(null, files);
  });
};

ContentProvider.prototype.stat = function(path, callback) {
  fs.stat(path, function(error, stats) {
    if (error) {
      return callback(error);
    }

    if (stats.isDirectory()) {
      stats.mime = DIRECTORY_MIME_TYPE;

      return callback(null, stats);
    }

    var mime = Mime.lookup(path, "");
    stats.mime = mime;

    return callback(null, stats);
  });
};

ContentProvider.prototype.createReadStream = function(path, options, callback) {
  try {
    var stream = fs.createReadStream(path);

    return callback(null, stream);

  } catch (x) {
    logger.error("Can not access to " + path, x);

    return callback(x);
  }
};
