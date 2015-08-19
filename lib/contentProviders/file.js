/*jslint node: true, nomen: true */
"use strict";

var Util = require('util');
var Mime = require('mime');
var fs = require('fs');
var Path = require('path');
var Async = require('async');

var debug = require('debug')('upnpserver:contentProvider:file');
var logger = require('../logger');

var ContentProvider = require('./contentProvider');

var DIRECTORY_MIME_TYPE = "application/x-directory";

var CHANGE_PATH_SEPARATOR = (Path.sep !== '/');

function FileContentProvider(server, configuration) {
  ContentProvider.call(this, server, configuration);
}

Util.inherits(FileContentProvider, ContentProvider);

module.exports = FileContentProvider;

FileContentProvider.prototype.readdir = function(basePath, callback) {

  var osPath = basePath;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  fs.readdir(osPath, function(error, files) {
    if (error) {
      return callback(error);
    }

    for (var i = 0; i < files.length; i++) {
      files[i] = basePath + '/' + files[i];
    }

    if (debug.enabled) {
      debug("readdir('" + basePath + "' returns", files);
    }

    return callback(null, files);
  });
};

FileContentProvider.prototype.stat = function(path, callback) {
  var osPath = path;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  fs.stat(osPath, function(error, stats) {
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

FileContentProvider.prototype.createReadStream = function(session, path,
    options, callback) {
  var osPath = path;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  function openStream() {
    if (debug.enabled) {
      debug("createReadStream osPath=", osPath, "options=", options);
    }

    try {
      var stream = fs.createReadStream(osPath, options);

      if (options && options.fd) {
        stream.destroy = function() {
        };
      }

      return callback(null, stream);

    } catch (x) {
      logger.error("Can not access to " + path, x);

      return callback(x);
    }
  }

  if (session) {
    options = options || {};
    options.flags = 'r';
    options.autoClose = false;

    if (debug.enabled) {
      debug("createReadStream path=", osPath, "session.fd=" + session.fd);
    }

    if (!session.fd) {
      fs.open(osPath, 'r', function(error, fd) {
        if (error) {
          return callback(error);
        }
        session.fd = fd;
        options.fd = fd;

        if (debug.enabled) {
          debug("createReadStream open '" + osPath + "' => session.fd=" +
              session.fd);
        }

        openStream();
      });

      return;
    }

    options.fd = session.fd;
  }

  openStream();
};

FileContentProvider.prototype.end = function(session, callback) {
  if (session && session.fd) {

    if (debug.enabled) {
      debug("Close fd " + session.fd);
    }

    fs.close(session.fd, function(error) {
      delete session.fd;

      callback(error);
    });
    return;
  }
  callback();
};

FileContentProvider.prototype.monitor = function(path) {
  // TODO
  fs.watch(path, function(event, filename) {
    if (debug.enabled) {
      debug('PathRepository: event is: ' + event, " filename=", filename);
    }
  });

  var self = this;

  fs.exists(path, function(exists) {
    if (!exists) {
      logger.error("Path '" + path + "' does not exist !");
      return;
    }

    fs.watch(path, function(event, filename) {
      if (debug.enabled) {
        debug('PathRepository: event is: ' + event, " filename=", filename);
      }

      if (!filename) {
        if (self.root) {
          self.root.update();
        }
        return;
      }

      var node = self.root;
      var p = filename.split(Path.sep);

      Async.each(p, function(segment, callback) {
        if (!node) {
          return callback(null);
        }

        node.getChildByName(segment, function(error, item) {
          if (error) {
            return callback(error);
          }

          if (item) {
            node = item;
          }

          return callback(null);
        });

      }, function(error) {
        if (error) {
          logger.error("pathRepository: watch error ", error);
        }
        if (node) {
          node.update();
        }
      });
    });
  });
}
