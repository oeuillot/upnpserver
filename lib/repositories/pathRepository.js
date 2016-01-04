/*jslint node: true, esversion: 6 */
"use strict";

const Async = require('async');
const Path = require('path');

const debug = require('debug')('upnpserver:repository:Path');

const Repository = require('./repository');
const Item = require('../node');
const logger = require('../logger');

const AudioItem = require('../class/object.item.audioItem');
const VideoItem = require('../class/object.item.videoItem');
const ImageItem = require('../class/object.item.imageItem');

const BROWSE_FILES_LIMIT = 4;

class PathRepository extends Repository {

  /**
   * 
   */
  constructor(repositoryId, mountPath, path, searchClasses) {

    super(repositoryId, mountPath);

    if (Path.sep !== '/') {
      path = path.replace(/\\/g, '/');
    }

    if (searchClasses === undefined) {
      searchClasses = [ {
        name : AudioItem.UPNP_CLASS,
        includeDerived : true
      }, {
        name : ImageItem.UPNP_CLASS,
        includeDerived : true
      }, {
        name : VideoItem.UPNP_CLASS,
        includeDerived : true
      } ];
    }

    this.directoryPath = path;
    this.searchClasses = searchClasses;
  }

  /**
   * 
   */
  initialize(service, callback) {
    this.contentProvider = service.getContentProvider(this.directoryPath);

    Repository.prototype.initialize.call(this, service, callback);
  }

  /**
   * 
   */
  browse(list, node, callback) {
    if (node.path.indexOf(this.mountPath) !== 0) {
      return callback();
    }

    var itemPath = node.path;
    var path = itemPath.substring(this.mountPath.length);
    var contentProvider = this.contentProvider;

    this._addSearchClasses(node);

    if (path) {
      path = "/" + path.replace(/^\//, '');
    }

    path = this.directoryPath + path;

    if (debug.enabled) {
      debug("PathRepository: browseNode #", node.id, "nodePath=", itemPath, "diskPath=", path);
    }

    contentProvider.readdir(path, (error, files) => {
      if (error) {
        if (error.code === "ENOENT") {
          // It can be a virtual folder!

          if (debug.enabled) {
            debug("PathRepository: ENOENT for " + path);
          }
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

      if (debug.enabled) {
        debug("PathRepository: path=" , path, "returns length=" + files.length);
      }

      Async.eachLimit(files, BROWSE_FILES_LIMIT, (file, callback) => {

        var p = file;
        contentProvider.stat(p, (error, stats) => {
          if (error) {
            logger.error("Stat error for ", p, error);
            return callback(null, list); // Access problem ...
          }

          if (stats.isDirectory()) {
            return this.addDirectory(node, p, stats, (error, node) => {
              if (error) {
                return callback(error);
              }

              if (node) {
                list.push(node);
              }
              callback();
            });
          }

          if (stats.isFile()) {
            return this.addFile(node, p, stats, (error, node) => {

              // console.log("Add item '" + p + "' returns ", node);

              if (error) {
                if (error.code === Repository.UPNP_CLASS_UNKNOWN) {
                  return callback();
                }
                return callback(error);
              }

              if (node) {
                list.push(node);
              }
              return callback();
            });
          }

          logger.warn("Unsupported file '" + p + "' ", stats);
          callback();
        });

      }, (error) => {
        if (error) {
          return callback(error);
        }

        if (debug.enabled) {
          debug("PathRepository: END browse=", itemPath, " path=", path,
              " list.length=", list.length);
        }
        callback(null, list);
      });
    });
  }

  _addSearchClasses(node) {
    if (!this.searchClasses) {
      return;
    }

    this.searchClasses.forEach((sc) => node.addSearchClass(sc.name, sc.includeDerived));
  }

  addDirectory(parentNode, contentURL, stats,
      callback) {
    var name = contentURL;
    var ret = /\/([^/]+$)/.exec(name); // We can not use basename, because of Win32
    name = (ret && ret[1]) || name;

    parentNode.getChildByName(name, (error, node) => {
      if (error) {
        return callback(error);
      }

      if (node && node.contentURL === contentURL &&
          stats.isDirectory()) {

        debug("Directory ALREADY EXISTS #", node.id, "contentURL=", node.contentURL);

        return callback(null, node);
      }

      return this.newFolder(parentNode, contentURL, null, stats, null, callback);
    });
  }

  /**
   * 
   */
  addFile(parentNode, contentURL, stats, callback) {
    var name = contentURL;
    var ret = /\/([^/]+$)/.exec(name); // We can not use basename, because of Win32
    name = (ret && ret[1]) || name;

    parentNode.getChildByName(name, (error, node) => {
      if (error) {
        return callback(error);
      }

      if (node && node.contentURL === contentURL && stats.isFile() &&
          node.contentTime === stats.mtime) {

        debug("File ALREADY EXISTS #", node.id, "contentURL=", node.contentURL);

        return callback(null, node);
      }

      return this.newFile(parentNode, contentURL, null, stats,  null, false, null, callback);
    });
  }
}

module.exports = PathRepository;
