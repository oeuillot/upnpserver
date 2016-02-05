/*jslint node: true, plusplus:true, esversion: 6 */
"use strict";

const assert = require('assert');
const Uuid = require('node-uuid');
const Async = require('async');

const debug = require('debug')('upnpserver:repositories');
const logger = require('../logger');

const Node = require('../node');
const UpnpContainer = require('../class/object.container');

class Repository {
  constructor(mountPath, configuration) {
    assert.equal(typeof (mountPath), "string", "Invalid mountPath parameter");
    
    this._configuration=configuration || {};
    
    if (!mountPath) {
      mountPath = "";
    }
    if (mountPath.charAt(0) !== '/') {
      mountPath = "/" + mountPath;
    }

    this._mountPath = mountPath;
  }
  
  get configuration() {
    return this._configuration;
  }
  
  get hashKey() {
    return {
      type: this.type,
      mountPath: this.mountPath
    };
  }
  
  get type() {
    throw new Error("Not implemented !");
  }
  
  /**
   * 
   */
  get id() {
    return this._id;
  }
  
  /**
   * 
   */
  get mountPath() {
    return this._mountPath;
  }

  /**
   * 
   */
  get service() {
    if (!this.contentDirectoryService) {
      throw new Error("Not yet initialized");
    }
    return this.contentDirectoryService;
  }

  /**
   * 
   */
  initialize(service, callback) {
    this.contentDirectoryService = service;
    
    debug("initialize", "Initialize repository",this.id);

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
  _installListeners(service) {
    if (this.browse) {
      service.asyncOn("browse", (list, node, options, callback) => this.browse(list, node, options, callback));
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

    var found= upnpClasses.find((up) => {
      var upnpClass = up.upnpClass;

      if (typeof (upnpClass.acceptFile) !== "function") {
        return false;
      }

      return upnpClass.acceptFile(fileInfos);
    });      
    if (!found) {
      return null;
    }
    
    return found.upnpClass;
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

    debug("initialize", "newVirtualContainer parentNode=#", parentNode.id, "name=", name,
        "upnpClass=", upnpClass, "attributes=", attributes);

    assert(parentNode instanceof Node, "Invalid parentNode parameter");
    assert(typeof (name) === "string", "Invalid name parameter");
    assert(typeof (callback) === "function", "Invalid callback parameter");

    attributes = attributes || {};

    upnpClass = upnpClass || UpnpContainer.UPNP_CLASS;

    this.service.newNode(parentNode, name, upnpClass, attributes, (node) => {

    }, before, 
        (error, newNode, newNodeId) => {
          if (error) {
            logger.error("Can not create new node '"+name+"' to #"+parentNode.id);
            return callback(error);
          }

          debug("initialize", "NewNode created #", newNodeId, "=", newNode.attributes, "error=", error);

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

    debug("_allocateNodesForPath", "allocate path=", path, "segments=", ps);

    var root=this.service.root;

    if (ps.length < 1 || !ps[0]) {
      return callback(null, root);
    }

    Async.reduce(ps, root, (parentNode, segment, callback) => {

      parentNode.getFirstVirtualChildByTitle(segment, (error, node) => {
        if (error) {
          return callback(error);
        }

        if (node) {
          debug("_allocateNodesForPath", "segment=", segment, "in", parentNode.id,
              "=>", node.id);

          return callback(null, node);
        }

        debug("_allocateNodesForPath", "segment=", segment, "in", parentNode.id, "=> NONE");

        this.newVirtualContainer(parentNode, segment, callback);
      });
    }, callback);
  }
  
  toString() {
    return "[Repository id="+this.id+" mountPath="+this.mountPath+"]";
  }
}

Repository.UPNP_CLASS_UNKNOWN = "UpnpClassUnknown";

module.exports = Repository;

