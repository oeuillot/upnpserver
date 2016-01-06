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

  /**
   * 
   */
  initialize(service, callback) {
    this.contentDirectoryService = service;

    this._allocateNodesForPath(this.mountPath, (error, node) => {
      if (error) {
        return callback(error);
      }

      this._installListeners(service);

      callback(null, node);
    });
  }

  /**
   * 
   */
  get service() {
    return this.contentDirectoryService;
  }

  /**
   * 
   */
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

    attributes = attributes || {};

    upnpClass = upnpClass || UpnpContainer.UPNP_CLASS;

    this.service.newNode(parentNode, name, upnpClass, attributes, true, null, before, 
        (error, newNode, newNodeId) => {
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

  /**
   * 
   */
  _allocateNodesForPath(path, callback) {

    var ps = path.split("/");
    ps.shift(); // Path must start with /, remove empty string first element

    debug("allocateNodesForPath path=", path, "segments=", ps);

    var root=this.service.root;

    if (ps.length < 1 || !ps[0]) {
      return callback(null, root);
    }

    Async.reduce(ps, root, (parentNode, segment, callback) => {

      parentNode.getFirstChildByName(segment, (error, node) => {
        if (error) {
          return callback(error);
        }

        if (node) {
          debug("allocateNodesForPath segment=", segment, "in", parentNode.id,
              "=>", node.id);

          return callback(null, node);
        }

        debug("allocateNodesForPath segment=", segment, "in", parentNode.id, "=> NONE");

        this.newVirtualContainer(parentNode, segment, callback);
      });
    }, callback);
  }
}

Repository.UPNP_CLASS_UNKNOWN = "UpnpClassUnknown";

module.exports = Repository;

