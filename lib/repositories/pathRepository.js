/*jslint node: true, plusplus:true, node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const Path = require('path');
const Uuid = require('node-uuid');
const util = require('util');
const Async = require('async');

const debug = require('debug')('upnpserver:repository');
const logger = require('../logger');

const Node = require('../node');
const UpnpContainer = require('../class/object.container');
const Repository = require('./repository');

class PathRepository extends Repository {
  constructor(repositoryId, mountPath, path, searchClasses) {
    super(repositoryId, mountPath, searchClasses);

    assert(typeof (path) === "string", "Invalid path parameter");

    debug("PathRepository constructor path=",path);
    
    if (Path.sep !== '/') {
      path = path.replace(/\\/g, '/');
    }
    this._directoryPath = path;
  }

  /**
   * 
   */
  initialize(service, callback) {
    this._contentProvider = service.getContentProvider(this.directoryPath);

    super.initialize(service, callback);
  }

  /**
   * 
   */
  get contentProvider() {
    return this._contentProvider;
  }

  get directoryPath() {
    return this._directoryPath;
  }
  
  /**
   * 
   */
  static FillAttributes(node, stats) {
    var attributes=node.attributes;

    if (attributes.size===undefined &&!node.service.upnpServer.configuration.strict) {
      attributes.size = stats.size;
    }

    if (stats.mime) {
      attributes.mime = stats.mime;
    }

    /* node.contentTime is the modifiedTime
    var mtime = stats.mtime;
    if (mtime) {
      if (mtime.getFullYear() >= 1970) {
        attributes.modifiedTime = mtime.getTime();
      } else {
        attributes.modifiedTime = mtime;        
      }
    }
     */
    var mtime=node.currentTime;

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
    if (birthtime && (!mtime || birthtime.getTime() < mtime.getTime())) {
      // birthtime can be after mtime ??? OS problem ???

      if (birthtime.getFullYear() >= 1970) {
        attributes.birthTime = birthtime.getTime();
      } else {
        attributes.birthTime = birthtime;
      }
    }
  }

  /**
   * 
   */
  newFile(parentNode, contentURL, upnpClass, stats, attributes, prepared, before, callback) {

    assert(parentNode instanceof Node, "Invalid parentNode parameter (" +
        parentNode + ")");
    assert(typeof (contentURL) === "string", "Invalid contentURL parameter (" +
        contentURL + ")");
    assert(typeof (callback) === "function", "Invalid callback parameter (" +
        callback + ")");

    var name = contentURL;
    var ret = /\/([^/]+)$/.exec(name);
    name = (ret && ret[1]) || name;

    attributes = attributes || {};

    var processStats = (stats) => {

      if (!upnpClass) {
        var fileInfos = {
            contentURL : contentURL,
            mime : attributes.mime,
            stats : stats
        };

        var upnpClasses = this.service.searchUpnpClass(fileInfos);
        if (upnpClasses && upnpClasses.length) {
          upnpClass = this.acceptUpnpClass(upnpClasses, fileInfos);
        }
      }

      if (!upnpClass) {
        callback({
          code : Repository.UPNP_CLASS_UNKNOWN
        });
        return;
      }

      this.service.newNode(parentNode, name, upnpClass, attributes, prepared, (node) => {
        node.contentURL=contentURL;
        node.contentTime=stats.mtime.getTime();
        PathRepository.FillAttributes(node, stats);

      }, before, callback);
    };

    if (stats) {
      return processStats(stats);
    }

    this.contentProvider.stat(contentURL, (error, stats) => {
      if (error) {
        return callback(error);
      }

      processStats(stats);
    });
  }

  /**
   * 
   */
  newFolder(parentNode, contentURL, upnpClass, stats, attributes, before, callback) {

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

    assert(parentNode instanceof Node, "Invalid parentNode parameter");
    assert(typeof (contentURL) === "string", "Invalid contentURL parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    var name = contentURL;
    var ret = /\/([^/]+$)/.exec(name); // We can not use basename, because of Win32
    name = (ret && ret[1]) || name;

    attributes = attributes || {};
//  attributes.contentURL = contentURL;

    var processStats = (stats) => {

      if (!upnpClass) {
        var fileInfos = {
            contentURL : contentURL,
            mime : "inode/directory",
            stats : stats
        };

        var upnpClasses = this.service.searchUpnpClass(fileInfos);
        if (upnpClasses && upnpClasses.length) {
          upnpClass = this.acceptUpnpClass(upnpClasses, fileInfos);
        }
      }

      this.service.newNode(parentNode, name, upnpClass, attributes, true, (node) => {
        node.contentURL=contentURL;
        node.contentTime=stats.mtime.getTime();
        PathRepository.FillAttributes(node, stats);

      }, before, callback);
    };

    if (stats) {
      return processStats(stats);
    }

    this.contentProvider.stat(contentURL, (error, stats) => {
      if (error) {
        return callback(error);
      }

      processStats(stats);
    });
  }
}

module.exports = PathRepository;

function computeDate(t) {
  if (t.getFullYear() >= 1970) {
    return t.getTime();
  }

  return t;
}
