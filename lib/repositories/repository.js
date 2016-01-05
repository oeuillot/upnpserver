/*jslint node: true, plusplus:true, node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const Path = require('path');
const Uuid = require('node-uuid');
const util = require('util');
const crypto = require('crypto');
const fs = require('fs');

const logger = require('../logger');

const debug = require('debug')('upnpserver:repository');

const Node = require('../node');
const UpnpContainer = require('../class/object.container');

class Repository {
  constructor(repositoryId, mountPath, searchClasses) {
    this.repositoryId = repositoryId || Uuid.v4();

    if (!mountPath) {
      mountPath = "";
    }
    if (mountPath.charAt(0) !== '/') {
      mountPath = "/" + mountPath;
    }

    this.mountPath = mountPath;
  }

  initialize(service, callback) {
    this.contentDirectoryService = service;

    service.allocateNodesForPath(this.mountPath, (error, node) => {
      if (error) {
        return callback(error);
      }

      this._installListeners(service);

      callback(null, node);
    });
  }

  get service() {
    return this.contentDirectoryService;
  }

  _installListeners(service) {
    if (this.browse) {
      service.asyncOn("browse", (list, node, callback) => this.browse(list, node, callback));
    }

    if (this.update) {
      service.asyncOn("update", (node, callback) => this.update(node, callback));
    }
  }

  /*
   * Repository.prototype.browse = function(list, node, callback) { return callback(null); };
   */
  /*
   * Repository.prototype.update = function(node, callback) { return callback(null); };
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

      // console.log(contentURL, attributes);

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

      this.service.newNode(parentNode, name, upnpClass,
          attributes, prepared, (node) => {
            node.contentURL=contentURL;
            node.contentTime=stats.mtime.getTime();
            Repository.FillAttributes(node, stats);

          }, before, callback);
      return;
    };

    if (stats) {
      return processStats(stats);
    }

    this.service.getContentProvider(contentURL).stat(contentURL, (error, stats) => {
      if (error) {
        return callback(error);
      }

      processStats(stats);
    });
  }

  /**
   * 
   */
  acceptUpnpClass(upnpClasses, fileInfos) {
    if (!upnpClasses) {
      return null;
    }

    return upnpClasses.find((up) => {
      var upnpClass = up.upnpClass;

      if (typeof (upnpClass.acceptFile) !== "function") {
        return false;
      }

      return upnpClass.acceptFile(fileInfos);
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

    assert(parentNode instanceof Node, "Invalid parentNode parameter (" +
        parentNode + ")");
    assert(typeof (contentURL) === "string", "Invalid contentURL parameter (" +
        contentURL + ")");
    assert(typeof (callback) === "function", "Invalid callback parameter (" +
        callback + ")");

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
        Repository.FillAttributes(node, stats);

      }, before, callback);
    };

    if (stats) {
      return processStats(stats);
    }

    this.service.getContentProvider(contentURL).stat(contentURL, (error, stats) => {
      if (error) {
        return callback(error);
      }

      processStats(stats);
    });
  }

  /**
   * 
   */
  newVirtualContainer(parentNode, name, upnpClass, attributes, before, callback) {

    switch (arguments.length) {
    case 3:
      callback = upnpClass;
      upnpClass = undefined;
      break;
    case 4:
      callback = attributes;
      attributes = undefined;
      break;
    case 5:
      callback = before;
      before = undefined;
      break;
    }

    debug("newVirtualContainer parentNode=#", parentNode.id, "name=", name,
        "upnpClass=", upnpClass, "attributes=", attributes);

    assert(parentNode instanceof Node, "Invalid parentNode parameter");
    assert(typeof (name) === "string", "Invalid name parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    if (!attributes) {
      attributes = {};
    }

    upnpClass = upnpClass || UpnpContainer.UPNP_CLASS;

    this.service.newNode(parentNode, name, upnpClass, attributes, true, (node) => {
      node.virtual=true;

    }, before, (error, newNode, newNodeId) => {
      if (error) {
        logger.error("Can not create new node '"+name+"' to #"+parentNode.id);
        return callback(error);
      }

      debug("NewNode created #", newNodeId, "=", newNode.attributes, "error=", error);

      callback(error, newNode, newNodeId);
    });
  }

  /**
   * 
   */
  newNodeRef(parentNode, targetNode, name, initCallback, before, callback) {

    switch (arguments.length) {
    case 3:
      callback = name;
      name = undefined;
      break;
    case 4:
      callback = initCallback;
      initCallback = undefined;
      break;
    case 5:
      callback = before;
      before = undefined;
      break;
    }

    assert(parentNode instanceof Node, "Invalid parentNode parameter");
    assert(targetNode instanceof Node, "Invalid targetNode parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    this.service.newNodeRef(parentNode, targetNode, name, initCallback, before,
        callback);
  }
}


Repository.UPNP_CLASS_UNKNOWN = "UpnpClassUnknown";

module.exports = Repository;

function computeDate(t) {
  if (t.getFullYear() >= 1970) {
    return t.getTime();
  }

  return t;
}
