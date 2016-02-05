/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Async = require('async');
const Path = require('path');

const debug = require('debug')('upnpserver:repositories:Directory');
const logger = require('../logger');

const Repository = require('./repository');
const PathRepository = require('./path');
const Node = require('../node');

const AudioItem = require('../class/object.item.audioItem');
const VideoItem = require('../class/object.item.videoItem');
const ImageItem = require('../class/object.item.imageItem');

const BROWSE_FILES_LIMIT = 4;

class DirectoryRepository extends PathRepository {

  /**
   * 
   */
  constructor(mountPath, configuration) {

    super(mountPath, configuration);

    if (this.configuration.searchClasses === undefined) {
      this.configuration.searchClasses = [ {
        
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
  }

  get type() {
    return "directory";
  }

  /**
   * 
   */
  browse(list, node, options, callback) {
    assert(node instanceof Node, "Invalid node parameter");
    assert.equal(typeof(callback), "function", "Invalid callback parameter");

    debug("browse", "Browse of #",node.id,"path=",node.path,"mountPath=",this.mountPath);

    if (node.path.indexOf(this.mountPath) !== 0) {
      return callback();
    }

    node.takeLock("scanner", () => {

      var itemPath = node.path;
      var path = itemPath.substring(this.mountPath.length);
      var contentProvider = this.contentProvider;

      this._addSearchClasses(node);

      if (path) {
        path = "/" + path.replace(/^\//, '');
      }

      path = this.directoryPath + path;

      debug("browse", "Browse #", node.id, "nodePath=", itemPath, "diskPath=", path);

      node.mapChildrenByTitle((error, map) => {
        if (error) {
          node.leaveLock("scanner");

          logger.error("Can not map node #"+node.id, error);
          return callback(null);
        }
        debug("browse", "map computed=",map);

        contentProvider.readdir(path, (error, files) => {
          if (error) {
            if (error.code === "ENOENT") {
              // It can be a virtual folder!

              debug("browse: ENOENT for " + path);

              node.leaveLock("scanner");
              return callback(null);
            }

            if (error.code === "EACCES") {
              // No right to read Folder

              logger.error("DirectoryRepository: Can not read directory " + path);
              node.leaveLock("scanner");
              return callback(null);
            }

            logger.error("DirectoryRepository: Error for " + path, error);
            node.leaveLock("scanner");
            return callback(error);
          }

          debug("browse", "path=" , path, "returns length=" + files.length);

          Async.eachLimit(files, BROWSE_FILES_LIMIT, (file, callback) => {

            var p = file;
            contentProvider.stat(p, (error, stats) => {
              debug("browse", "child=",p,"stats=",stats);
              if (error) {
                logger.error("Stat error for ", p, error);
                return callback(null, list); // Access problem ...
              }

              if (stats.isDirectory()) {
                this.addDirectory(node, map, p, stats, (error, node) => {
                  if (error) {
                    logger.error("Stat add directory error for ", p, error);
                    return callback(error);
                  }

                  if (node) {
                    list.push(node);
                  }
                  callback();
                });
                return;
              }

              if (stats.isFile()) {
                this.addFile(node, map, p, stats, (error, node) => {

                  // console.log("Add item '" + p + "' returns ", node);

                  if (error) {
                    if (error.code === Repository.UPNP_CLASS_UNKNOWN) {
                      return callback();
                    }
                    logger.error("Stat add file error for ", p, error);
                    return callback(error);
                  }

                  if (node) {
                    list.push(node);
                  }
                  callback();
                });
                return;
              }

              logger.warn("Unsupported file '" + p + "' ", stats);
              callback();
            });

          }, (error) => {
            node.leaveLock("scanner");

            if (error) {
              return callback(error);
            }

            debug("browse", "END browse=", itemPath, " path=", path,
                " list.length=", list.length);
            callback(null, list);
          });
        });
      });
    });
  }

  /**
   * 
   */
  _addSearchClasses(node) {
    var searchClasses = this.configuration.searchClasses;
    if (!searchClasses) {
      return;
    }

    searchClasses.forEach((sc) => node.addSearchClass(sc.name, sc.includeDerived));
  }

  /**
   * 
   */
  addDirectory(parentNode, map, contentURL, stats, callback) {
    var name = stats.name;
    if (!name) {
      var ret = /\/([^/]+$)/.exec(contentURL); // We can not use basename, because of Win32
      name = (ret && ret[1]) || name;
    }

    var nodesIdsByTitle=map[name];

    Async.detectLimit(nodesIdsByTitle, 2, (nodeId, callback) => {
      parentNode.service.getNodeById(nodeId, (error, node) => {
        if (error) {
          logger.error("Can not getNodeById #", nodeId, error);
          return callback(false);
        }

        if (node.contentURL === contentURL && stats.isDirectory() && node.isContainer) {

          debug("File ALREADY EXISTS #", node.id, "contentURL=", node.contentURL);

          return callback(true);
        }

        callback(false);
      });
    }, (result) => {
      if (result) {
        return callback(null, result);
      }

      this.newFolder(parentNode, contentURL, null, stats, callback);
    });
  }

  /**
   * 
   */
  addFile(parentNode, map, contentURL, stats, callback) {
    debug("addFile", "Add file contentURL=",contentURL,"mime=",stats.mime);

    parentNode.service.loadMetas({mime: stats.mime, contentURL: contentURL}, (error, attributes) => {
      if (error) {
        logger.error("LoadMetas of '"+contentURL+"' error", error);
        return callback(error);
      }

      debug("addFile", "loadMetas(",contentURL,")=>",attributes,"error=",error);

      var name=attributes.title || stats.name;
      if (!name) {
        var ret = /\/([^/]+$)/.exec(contentURL); // We can not use basename, because of Win32
        name = (ret && ret[1]) || name;
      }

      var nodesIdsByTitle=map[name];

      debug("addFile", "NodeIdsByTitle[",name,"]=>",nodesIdsByTitle);

      Async.detectLimit(nodesIdsByTitle, 2, (nodeId, callback) => {
        parentNode.service.getNodeById(nodeId, (error, node) => {
          if (error) {
            logger.error("Can not getNodeById #",nodeId, error);
            return callback(false);
          }

          if (node.contentURL === contentURL &&
              node.contentTime === stats.mtime.getTime() && stats.isFile() && !node.isContainer) {

            debug("addFile", "File ALREADY EXISTS #", node.id, "contentURL=", node.contentURL);

            return callback(true);
          }

          debug("addFile", "New File #", node.id, "contentURL=", node.contentURL,"name=",name);

          callback(false);
        });
      }, (result) => {
        debug("addFile", "Result=",result);
        if (result) {
          return callback(null, result);
        }

        this.newFile(parentNode, contentURL, null, stats,  attributes, null, callback);     
      });
    });
  }
}

module.exports = DirectoryRepository;
