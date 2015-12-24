/*jslint node: true, plusplus:true, nomen: true */
"use strict";

var assert = require('assert');
var Util = require('util');
var Async = require('async');
var Path = require('path');

var debug = require('debug')('upnpserver:scannerRepository');

var Repository = require('./repository');
var logger = require('../logger');

var FILES_PROCESSOR_LIMIT = 4;
var FOLDER_SCAN_LIMIT = 4;
var DIRECTORY_SCAN_LIMIT = 2;

var SCAN_WAITING_MS = 1000 * 60;

var ScannerRepository = function(repositoryId, mountPath, path) {
  Repository.call(this, repositoryId, mountPath);

  assert(typeof (path) === "string", "Invalid path parameter");

  if (Path.sep !== '/') {
    path = path.replace(/\\/g, '/');
  }
  this.directoryPath = path;
};

Util.inherits(ScannerRepository, Repository);

module.exports = ScannerRepository;

ScannerRepository.prototype.initialize = function(service, callback) {
  var self = this;
  var log = false;

  this.contentProvider = service.getContentProvider(this.directoryPath);

  function scan(node) {
    self.scan(service, node, function(error) {
      if (error) {
        logger.error("ScannerRepository: Scan error", error);
        return;
      }

      if (!log) {
        return;
      }

      node.treeString(function(error, string) {
        if (error) {
          logger.error("ScannerRepository: Tree string error", error);
          return;
        }
        logger.debug(string);
      });
    });

  }

  Repository.prototype.initialize.call(this, service, function(error, node) {
    if (error) {
      return callback(error);
    }

    setImmediate(function() {
      scan(node);
    });

    /*
     * if (self.contentDirectoryService.upnpServer.configuration.watchFolders) { fs.watch(self.directoryPath, function(event,
     * filename) {
     * 
     * if (debug.enabled) { debug('ScannerRepository: event is: ' + event);
     * 
     * if (filename) { logger.debug('filename provided: ' + filename); } else { logger.debug('filename not provided'); } }
     * 
     * if (self._scanTimeout) { clearTimeout(self._scanTimeout); delete self._scanTimeout; }
     * 
     * self._scanTimeout = setTimeout(function() {
     * 
     * var markId = Date.now(); / * listIds(item, markId, function(error, beforeIds) { scan(item);
     * 
     * listIds(item, function(error, afterIds) {
     * 
     * }); }); / }, SCAN_WAITING_MS); }); }
     */

    callback(null, node);
  });
};

ScannerRepository.prototype.scan = function(service, node, callback) {

  var self = this;
  var files = [];

  var infos = {
    contentURL : this.directoryPath,

    node : node
  };

  self._scanDirectory(node, infos, files, function(error) {
    if (error) {
      logger.error("Scan directory error", error);

      return callback(error);
    }

    if (debug.enabled) {
      debug("Number of files to process: " + files.length);
    }

    Async.eachLimit(files, FILES_PROCESSOR_LIMIT, function(infos, callback) {
      self.processFile(node, infos, function(error) {
        if (error) {
          logger.error("Process file node=#" + node.id + " infos=", infos,
              " error=", error);
        }

        setImmediate(callback);
      });

    }, function(error) {

      if (error) {
        logger.error("Error while scaning files ", error);
        return callback(error);
      }

      if (debug.enabled) {
        debug(files.length + " files processed");
      }

      setImmediate(callback);
    });
  });
};

/*
 * ScannerRepository.prototype.browse = function(list, item, callback) { return callback(null); };
 */

ScannerRepository.prototype._scanDirectory = function(rootNode, parentInfos,
    files, callback) {

  var contentProvider = this.contentProvider;

  // logger.debug("List directory ", parentInfos);

  assert(parentInfos, "Parent infos is null");
  assert(parentInfos.contentURL, "ContentURL of Parent infos is undefined");

  var self = this;
  contentProvider.readdir(parentInfos.contentURL, function(error, list) {
    if (error) {
      logger.warn("Error while reading directory ", parentInfos.contentURL);
      return callback(null);
    }

    var directories = [];
    Async.eachLimit(list, FOLDER_SCAN_LIMIT, function(path, callback) {

      var p = path;
      contentProvider.stat(p, function(error, stats) {
        if (error) {
          logger.error("Error while stat ", p, error);
          return callback(null, list);
        }

        // logger.debug("Scan item ", p);

        var infos = {
          contentURL : p,
          stats : stats,
          mime : stats.mime,

          parentInfos : parentInfos
        };

        if (stats.isDirectory()) {
          if (self.keepDirectory(infos)) {
            directories.push(infos);
          }
          return callback(null);
        }

        if (stats.isFile()) {
          // Faire un scannerRepository pour filtrer des fichiers

          if (self.keepFile(infos)) {
            // logger.debug("Keep file ", p);
            files.push(infos);
          }

          return callback(null);
        }

        callback(null);
      });

    }, function(error) {
      if (error) {
        logger.error("Reduce error", error);
        return callback(error);
      }

      if (!directories.length) {
        return callback(null);
      }

      Async.eachLimit(directories, DIRECTORY_SCAN_LIMIT, function(
          directoryInfos, callback) {

        self.processDirectory(rootNode, directoryInfos, files, function(error) {
          if (error) {
            return callback(error);
          }

          setImmediate(callback);
        });

      }, callback);
    });
  });
};

ScannerRepository.prototype.keepFile = function(infos) {
  return false;
};

ScannerRepository.prototype.keepDirectory = function(infos) {
  return true;
};

ScannerRepository.prototype.processFile = function(node, infos, callback) {
  callback("Nothing to process ?");
};

ScannerRepository.prototype.processDirectory = function(rootNode,
    directoryInfos, files, callback) {

  this._scanDirectory(rootNode, directoryInfos, files, callback);
};
