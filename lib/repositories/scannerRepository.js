/*jslint node: true, plusplus:true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Util = require('util');
const Async = require('async');
const Path = require('path');

const debug = require('debug')('upnpserver:repository:Scanner');

const PathRepository = require('./pathRepository');
const logger = require('../logger');

const FILES_PROCESSOR_LIMIT = 4;
const FOLDER_SCAN_LIMIT = 4;
const DIRECTORY_SCAN_LIMIT = 2;

const SCAN_WAITING_MS = 1000 * 60;

class ScannerRepository extends PathRepository {

  /**
   * 
   */
  initialize(service, callback) {
    var log = false;

    var scan = (node) => {
      var dt=Date.now();
      
      this.scan(service, node, (error) => {
        if (error) {
          logger.error("ScannerRepository: Scan error", error);
          return;
        }
        
        var s=Math.floor((Date.now()-dt)/1000);

        logger.info(`Scan of repository ${this.directoryPath} has been finished in ${s} second${(s>1)?"s":""}`);
        
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

      debug("Number of files to process : path=" , infos.contentURL, "count=",files.length);

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

        debug(files.length, "files processed");
        
        setImmediate(callback);
      });
    });
  }

  /**
   * 
   */
  _scanDirectory(rootNode, parentInfos, files, callback) {

    var contentProvider = this.contentProvider;

    debug("Scan directory", parentInfos);

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
