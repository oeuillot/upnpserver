/*jslint node: true */
"use strict";

var Util = require('util');
var Async = require('async');
var fs = require('fs');
var Path = require('path');
var Mime = require('mime');

var Repository = require('../repository');
var Item = require('../node');
var logger = require('../logger');

var DIRECTORY_MIME_TYPE = "application/x-directory";
var WATCH_ENABLED = false;

var PathRepository = function(repositoryId, mountPath, path, searchClasses) {
  Repository.call(this, repositoryId, mountPath);

  this.directoryPath = path;
  this.searchClasses = searchClasses;

  var self = this;

  if (WATCH_ENABLED) {
    fs.watch(path, function(event, filename) {
      logger
          .debug('PathRepository: event is: ' + event, " filename=", filename);
    });

    fs.exists(path, function(exists) {
      if (!exists) {
        logger.error("Path '" + path + "' does not exist !");
        return;
      }

      fs.watch(path, function(event, filename) {
        logger.debug('PathRepository: event is: ' + event, " filename=",
            filename);

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
};

Util.inherits(PathRepository, Repository);

module.exports = PathRepository;

PathRepository.prototype.browse = function(list, item, callback) {

  var self = this;
  var itemPath = item.getPath();
  var path = itemPath.substring(this.mountPath.length);

  if (path && path.charAt(0) !== '/') {
    path = "/" + path;
  }

  path = this.directoryPath + path.replace(/\//g, Path.sep);

  logger.debug("PathRepository: browseNode=" + itemPath + " path=", path);

  fs.readdir(path, function(error, files) {
    if (error) {
      if (error.code === "ENOENT") {
        // It can be a virtual folder!

        logger.debug("PathRepository: ENOENT for " + path);
        return callback(null);
      }

      if (error.code === "EACCES") {
        // No right to read Folder

        logger.error("PathRepository: Can not read directory " + path);
        return callback(null);
      }

      logger.error("PathRepository: Error for " + path, error);
      return callback(error);
    }

    logger.debug("PathRepository: path " + path + " returns " + files.length +
        " files");

    Async.reduce(files, [], function(list, file, callback) {

      var p = path + Path.sep + file;
      fs.stat(p, function(error, stats) {
        if (error) {
          logger.error("Stat error for ", p, error);
          return callback(null, list); // Access problem ...
        }

        if (stats.isDirectory()) {
          stats.mime = DIRECTORY_MIME_TYPE;
          return self.addDirectory(item, p, stats, function(error, item) {
            if (error) {
              return callback(error, list);
            }

            if (item) {
              list.push(item);
            }
            return callback(null, list);
          });
        }

        if (stats.isFile()) {
          return self.newFile(item, p, null, stats, null,
              function(error, item) {

               // console.log("Add item '" + p + "' returns ", item);

                if (error) {
                  if (error.code === Repository.UPNP_CLASS_UNKNOWN) {
                    return callback(null, list);
                  }
                  return callback(error, list);
                }

                if (item) {
                  list.push(item);
                }
                return callback(null, list);
              });
        }

        logger.warn("Unsupported file '" + p + "' ", stats);
        callback(null, list);
      });

    }, function(error, list) {
      if (error) {
        return callback(error);
      }

      logger.debug("PathRepository: END browse=", itemPath, " path=", path,
          " list.length=", list.length);
      callback(null, list);
    });
  });
};

PathRepository.prototype.addDirectory = function(parent, name, stats, callback) {
  return this.newFolder(parent, name, null, stats, null, callback);
};
