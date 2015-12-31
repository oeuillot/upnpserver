/*jslint node: true, plusplus:true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Util = require('util');
const Async = require('async');
const Path = require('path');

const debug = require('debug')('upnpserver:repository:Scanner');

const Repository = require('./repository');
const logger = require('../logger');

const FILES_PROCESSOR_LIMIT = 4;
const FOLDER_SCAN_LIMIT = 4;
const DIRECTORY_SCAN_LIMIT = 2;

const SCAN_WAITING_MS = 1000 * 60;

class ScannerRepository extends Repository {
  constructor(repositoryId, mountPath, path) {
    super(repositoryId, mountPath);

    assert(typeof (path) === "string", "Invalid path parameter");

    if (Path.sep !== '/') {
      path = path.replace(/\\/g, '/');
    }
    this.directoryPath = path;
  }

  /**
   * 
   */
  initialize(service, callback) {
    var log = false;

    this.contentProvider = service.getContentProvider(this.directoryPath);

    var scan = (node) => {
      this.scan(service, node, (error) => {
        if (error) {
          logger.error("ScannerRepository: Scan error", error);
          return;
        }

        if (!log) {
          return;
        }

        node.treeString((error, string) => {
          if (error) {
            logger.error("ScannerRepository: Tree string error", error);
            return;
          }
          logger.debug(string);
        });
      });

    };

    super.initialize(service, (error, node) => {
      if (error) {
        return callback(error);
      }

      setImmediate(() => scan(node));

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
  }

  /**
   * 
   */
  scan(service, node, callback) {

    var files = [];

    var infos = {
        contentURL : this.directoryPath,

        node : node
    };

    this._scanDirectory(node, infos, files, (error) => {
      if (error) {
        logger.error("Scan directory error", error);

        return callback(error);
      }

      debug("Number of files to process :" , files.length);

      Async.eachLimit(files, FILES_PROCESSOR_LIMIT, (infos, callback) => {
        debug("Process file :",infos.contentURL);
        
        this.processFile(node, infos, (error) => {
          if (error) {
            logger.error("Process file node=#" + node.id + " infos=", infos,
                " error=", error);
          }

          setImmediate(callback);
        });

      }, (error) => {

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
  }

  /*
   * ScannerRepository.prototype.browse = function(list, item, callback) { return callback(null); };
   */

  /**
   * 
   */
  _scanDirectory(rootNode, parentInfos,
      files, callback) {

    var contentProvider = this.contentProvider;

    // logger.debug("List directory ", parentInfos);

    assert(parentInfos, "Parent infos is null");
    assert(parentInfos.contentURL, "ContentURL of Parent infos is undefined");

    contentProvider.readdir(parentInfos.contentURL, (error, list) => {
      if (error) {
        logger.warn("Error while reading directory ", parentInfos.contentURL);
        return callback(null);
      }

      var directories = [];
      Async.eachLimit(list, FOLDER_SCAN_LIMIT, (path, callback) => {

        var p = path;
        contentProvider.stat(p, (error, stats) => {
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
            if (this.keepDirectory(infos)) {
              directories.push(infos);
            }
            return callback(null);
          }

          if (stats.isFile()) {
            // Faire un scannerRepository pour filtrer des fichiers

            if (this.keepFile(infos)) {
              // logger.debug("Keep file ", p);
              files.push(infos);
            }

            return callback(null);
          }

          callback(null);
        });

      }, (error) => {
        if (error) {
          logger.error("Reduce error", error);
          return callback(error);
        }
        
        debug("Directories length=",directories.length);

        if (!directories.length) {
          return callback(null);
        }

        Async.eachLimit(directories, DIRECTORY_SCAN_LIMIT, (directoryInfos, callback) => {

          debug("Scan directory", directoryInfos.contentURL, "files.count=",files.count);
          
          this.processDirectory(rootNode, directoryInfos, files, (error) => {
            if (error) {
              return callback(error);
            }

            setImmediate(callback);
          });
        }, callback);
      });
    });
  }

  /**
   * 
   */
  keepFile(infos) {
    return false;
  }

  /**
   * 
   */
  keepDirectory (infos) {
    return true;
  }

  /**
   * 
   */
  processFile(node, infos, callback) {
    debug("Process file: nothing to do ?");
    callback("Nothing to process ?");
  }

  /**
   * 
   */
  processDirectory(rootNode, directoryInfos, files, callback) {
    this._scanDirectory(rootNode, directoryInfos, files, callback);
  }
}
module.exports = ScannerRepository;
