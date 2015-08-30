/*jslint node: true, plusplus:true, nomen: true */
/*global setImmediate */
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

var ScannerRepository = function(configuration) {

  Repository.call(this, configuration);

  var path = configuration.path;

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
     * if (self.service.device.configuration.watchFolders) { fs.watch(self.directoryPath, function(event,
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

  self._scanDirectory(node, files, self.directoryPath, function(error) {
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

ScannerRepository.prototype._scanDirectory = function(node, files, rootPath,
    callback) {

  var service = node.service;
  var contentProvider = this.contentProvider;

  // logger.debug("List directory ", rootPath);

  var self = this;
  contentProvider.readdir(rootPath, function(error, list) {
    if (error) {
      logger.warn("Error while reading directory ", rootPath);
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

        if (stats.isDirectory()) {
          directories.push(p);
          return callback(null);
        }

        if (stats.isFile()) {
          // Faire un scannerRepository pour filtrer des fichiers

          var infos = {
            contentURL : p,
            stats : stats,
            mime : stats.mime
          };
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

      Async.eachLimit(directories, DIRECTORY_SCAN_LIMIT, function(directory,
          callback) {

        self._scanDirectory(node, files, directory, function(error) {
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

ScannerRepository.prototype.processFile = function(node, infos, callback) {
  callback("Nothing to process ?");
};
