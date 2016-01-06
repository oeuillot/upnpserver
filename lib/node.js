/*jslint node: true, sub: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Async = require("async");
const Util = require("util");

const Item = require('./class/object.item');
const ContentDirectoryService = require('./contentDirectoryService');

const Semaphore = require('./util/semaphore');

const debugFactory = require('debug');
const debug = debugFactory('upnpserver:node');
const debugGarbage = debugFactory('upnpserver:node:garbage');
const debugListChildren = debugFactory('upnpserver:node:listChildren');
const debugChildByName = debugFactory('upnpserver:node:childByName');

const logger = require('./logger');

const LIST_CHILDREN_LIMIT = 4;

const VERIFY_UNIQUE_KEY = false; // {};

class Node {

  /**
   * 
   */
  constructor(service, id) {
    assert(service, "Service is undefined !");
    assert(id !== undefined, "ID must be defined");

    if (VERIFY_UNIQUE_KEY) {
      if (VERIFY_UNIQUE_KEY[id]) {
        logger.error("************************** SAME KEY " + id);
        throw new Error("Invalid key '" + id + "'");
      }
      VERIFY_UNIQUE_KEY[id] = true;
    }

    this._id = id;
    this._service = service;
  }

  /**
   * 
   */
  static createRef(linkedNode, name, callback) {

    if (linkedNode.isContainer) {
      var error=new Error("Can not link a container (upnp limitation");
      error.node=linkedNode;
      return callback(error);
    }

    linkedNode._service.allocateNodeId((error, id) => {
      if (error) {
        return callback(error);
      }

      var node = new Node(linkedNode._service, id);

      node.refID = linkedNode._id;

      if (name) {
        node.name = name;
      }

      if (debug.enabled) {
        debug("NewNodeRef id=#" + node._id + " name=" + name + " linkedName=" +
            linkedNode.name);
      }

      linkedNode.appendLink(node, (error) => {
        callback(error, node);
      });
    });
  }

  /**
   * 
   */
  static create(service, name, upnpClass, attributes, callback) {

    service.allocateNodeId((error, id) => {
      if (error) {
        return callback(error);
      }

      var node = new Node(service, id);

      node.updateId = 0;
      node.prepared = false;

      if (name) {
        node.name = name;
      }
      if (attributes) {
        node.attributes = attributes;
      }

      assert(upnpClass instanceof Item, "UpnpClass must be an item " +
          upnpClass.name);
      node.upnpClass = upnpClass;


      if (debug.enabled) {
        debug("NewNode id=#" + node._id + " name=" + name + " upnpClass=" +
            upnpClass);
      }

      callback(null, node);
    });
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
  removeChild(child, callback) {

    var childrenIds = this.childrenIds;
    if (!childrenIds) {
      let ex = new Error("The node has no children");
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    var idx = childrenIds.indexOf(child._id);
    if (idx < 0) {
      let ex = new Error("Can not find child #" + child._id);
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    if (child.childrenIds && child.childrenIds.length) {
      let ex = new Error("Can not remove child #" + child._id +
      " if its contains children");
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    var service = this._service;

    this.takeLock("children", () => {
      idx = childrenIds.indexOf(child._id);
      if (idx < 0) {
        this.leaveLock("children");

        return callback();
      }

      this.childrenIds.splice(idx, 1);
      this.updateId++;

      delete child._path;
      delete child._parentId;

      service.saveNode(this, {
        updateId : this.updateId,
        $pull : {
          childrenIds : child._id
        }

      }, (error) => {
        if (error) {
          logger.error("Can not save node #", this._id, error);
          this.leaveLock("children");
          return callback(error);
        }

        service.registerUpdate(this);

        var refID = child.refID;

        service.unregisterNode(child, (error) => {
          if (error) {
            logger.error("Can not unregister node #", child._id, error);
            this.leaveLock("children");
            return callback(error);
          }

          this.leaveLock("children");

          if (!refID) {
            return callback();
          }

          service.getNodeById(refID, (error, refNode) => {
            if (error) {
              logger.error("Can not find linked node #", refID, error);
              return callback(error);
            }

            refNode.removeLink(child);

            callback();
          });
        });
      });
    });
  }

  /**
   * 
   */
  removeLink(child, callback) {
    this.takeLock("links", () => {
      var linkedIds = this.linkedIds;
      if (!linkedIds) {
        this.leaveLock("links");
        return callback(new Error("Node has no links"));
      }

      var idx = linkedIds.indexOf(child._id);
      if (idx < 0) {
        this.leaveLock("links");
        return callback(new Error("Can not find link"));
      }

      linkedIds.splice(idx, 1);

      this._service.saveNode(this, {
        $pull : {
          linkedIds : child._id
        }

      }, (error) => {
        this.leaveLock("links");

        callback(error, this);
      });
    });
  }

  /**
   * 
   */
  appendLink(child, callback) {
    this.takeLock("links", () => {
      var linkedIds = this.linkedIds;

      if (!linkedIds) {
        linkedIds = [];
        this.linkedIds = linkedIds;
      }

      linkedIds.push(child._id);

      this._service.saveNode(this, {
        $push : {
          linkedIds : child._id
        }

      }, (error) => {
        this.leaveLock("links");

        callback(error, this);
      });
    });
  }

  /**
   * 
   */
  appendChild(child, callback) {
    this.insertBefore(child, null, callback);
  }

  /**
   * 
   */
  insertBefore(child, before, callback) {
    if (debug.enabled) {
      debug("InsertBefore parent=#", this._id, " child=#", child._id, " before=#",
          (before ? before._id : null));
    }

    if (typeof (child._parentId) === "number") {
      let ex = new Error("Can not add a child which has already a parent !");
      ex.node = this;
      logger.error(ex);
      return callback(ex);
    }

    var service = this._service;

    // console.log("ENTER #"+this.id+ " #"+child.id);
    this.takeLock("children", () => {
      // console.log("ENTRED #"+this.id+ " #"+child.id);

      if (this._parentId === undefined) {
        let ex = new Error("Can not add a child to parent which is not connected !");
        ex.node = this;
        logger.error(ex);
        return callback(ex);
      }

      var childrenIds = this.childrenIds || [];
      var idx = childrenIds.length;

      if (typeof (before) === "number") {
        if (before > idx) {
          let ex = new Error("Before index overflow idx=" + before);
          ex.node = this;

          this.leaveLock("children");
          logger.error(ex);
          return callback(ex);
        }
        idx = before;

      } else if (before) {
        idx = childrenIds.indexOf(before._id);
        if (idx < 0) {
          let ex = new Error("Before child #" + before._id + " is not found");
          ex.node = this;

          this.leaveLock("children");
          logger.error(ex);
          return callback(ex);
        }
      }

      child._parentId = this._id;
      this.childrenIds = childrenIds;

      childrenIds.splice(idx, 0, child._id);
      this.updateId++;

      var childModifications = {
          parentId : child._parentId
      };

      if (!this._path) {
        // Node is not connected to the root !
        logger.error("**** Not connected to the root ? #" + this._id, "name=",
            this.name, "refId=", this.refID, "attributes=", this.attributes, "parentId=", this._parentId);

      } else {
        // Connected to root
        var ps = [ this._path ];
        if (this._path !== "/") {
          ps.push("/");
        }
        ps.push(child.name ? child.name : child._id);

        child._path = ps.join('');

        childModifications.path = child._path;
      }

      var nodeModifications = {
          updateId : this.updateId
      };

      if (before) {
        nodeModifications.childrenIds = childrenIds;
      } else {
        nodeModifications.$push = {
            childrenIds : child._id
        };
      }

      service.saveNode(this, nodeModifications, (error) => {
        if (error) {
          logger.error("Can not save node #", this._id, error);
          this.leaveLock("children");
          return callback(error);
        }

        service.saveNode(child, childModifications, (error) => {
          if (error) {
            logger.error("Can not save child node #", child._id, error);
            this.leaveLock("children");
            return callback(error);
          }

          service.registerUpdate(this);

          this.leaveLock("children");
          callback(null, this);
        });
      });
    });
  }

  /**
   * 
   */
  toJSONObject() {
    var obj = {
        id : this._id
    };

    if (this._parentId) {
      obj.parentId=this._parentId;
    }

    if (this.name) {
      obj.name = this.name;
    }
    if (this._path) {
      obj.path = this._path;
    }

    if (this.upnpClass) {
      obj.upnpClass = this.upnpClass.name;
    }

    if (this.updateId) {
      obj.updateId = this.updateId;
    }
    if (this.prepared === false) {
      obj.prepared = false;
    }
    if (this.refID) {
      obj.refId = this.refID;
    }
    if (this.attributes) {
      obj.attributes = this.attributes;
    }
    if (this.childrenIds && this.childrenIds.length) {
      obj.childrenIds = this.childrenIds;
    }
    if (this.linkedIds && this.linkedIds.length) {
      obj.linkedIds = this.linkedIds;
    }

    if (this.contentURL) {
      obj.contentURL = this.contentURL;
      if (this.contentTime) {
        obj.contentTime = this.contentTime;
      }
    }

    return obj;
  }

  /**
   * 
   */
  static fromJSONObject(service, obj) {

    var node = new Node(service, obj.id);
    if (obj.parentId) {
      node._parentId=obj.parentId;
    }
    if (obj.name) {
      node.name = obj.name;
    }

    if (obj.upnpClass) {
      node.upnpClass = service.upnpClasses[obj.upnpClass];
    }

    if (obj.contentProvider) {
      node.contentProvider = service.contentProviders[obj.contentProvider];
    }

    node.attributes = obj.attributes || {};

    if (obj.prepared === false) {
      node.prepared = false;
    }
    if (obj.updateId) {
      node.updateId = obj.updateId;
    }
    if (obj.refId) {
      node.refID = obj.refId;
    }
    if (obj.path) {
      node._path = obj.path;
    }
    if (obj.childrenIds) {
      node.childrenIds = obj.childrenIds;
    }
    if (obj.linkedIds) {
      node.linkedIds = obj.linkedIds;
    }

    if (obj.contentURL) {
      node.contentURL = obj.contentURL;
      if (obj.contentTime) {
        node.contentTime = obj.contentTime;
      }
    }

    return node;
  }

  /**
   * 
   */
  get isContainer() {
    return this.upnpClass && this.upnpClass.isContainer;
  }

  /**
   * 
   */
  listChildren(options, callback) {
    if (arguments.length === 1) {
      callback = options;
      options = undefined;
    }

    if (!this.isContainer) {
      let error=new Error("Node.listChildren #" + this._id, "=> not a container");
      error.node=this;

      return callback(error, null);
    }

    var resolveLinks = options && options.resolveLinks;
    var canUseCache = !resolveLinks;

    var service = this._service;

    this.takeLock("children", () => {

      if (canUseCache) {
        var cache = service._childrenWeakHashmap.get(this._id, this);
        if (cache) {
          cache = cache.slice(0); // Clone list

          this.leaveLock("children");
          return callback(null, cache);
        }
      }

      var getNodeFunc = (id, callback) => service.getNodeById(id, callback);

      if (resolveLinks) {
        var old = getNodeFunc;
        getNodeFunc = (id, callback) => {
          old(id, (error, node) => {
            if (error) {
              return callback(error);
            }

            node.resolveLink(callback);
          });
        };
      }

      var childrenIds = this.childrenIds;

      if (childrenIds !== undefined) {
        if (debugListChildren.enabled) {
          debugListChildren("Node.listChildren #", this._id, "=> cached ids list: length=",
              childrenIds.length, "list=", childrenIds);
        }

        Async.mapLimit(childrenIds, LIST_CHILDREN_LIMIT, (id, callback) => {
          getNodeFunc(id, (error, node) => {
            if (error) {
              logger.error("Can not get node #"+id, error, error.stack);
            }
            if (!node) {
              var mapError = new Error("Can not get node #" + id);
              mapError.error=error;
              return callback(mapError);
            }

            callback(null, node);
          });

        }, (error, result) => {
          if (error) {
            logger.error("Can not map ids", error, error.stack);
            if (debugListChildren.enabled) {
              debugListChildren("Node.listChildren #", this._id, "=> map returs error=", error);
            }

            this.leaveLock("children");
            return callback(error);
          }

          if (debugListChildren.enabled) {
            debugListChildren("listChildren #", this._id, "=> map returns", result);
          }

          if (canUseCache) {
            service._childrenWeakHashmap.put(this, result);
          }

          this.leaveLock("children");
          callback(null, result);
        });
        return;
      }

      if (debugListChildren.enabled) {
        debugListChildren("listChildren #", this._id, "=> not in cache !");
      }

      service.browseNode(this, (error, list) => {

        if (error) {
          this.leaveLock("children");
          return callback(error);
        }

        if (debugListChildren.enabled) {
          debugListChildren("listChildren #", this._id, "=>", list);
        }

        if (canUseCache) {
          service._childrenWeakHashmap.put(this, list);
        }

        this.leaveLock("children");
        return callback(null, list);
      });
    });
  }

  /**
   * 
   */
  filterChildNodes(filter, callback) {
    Node.filterChildNodes(this, null, filter, callback);
  }

  /**
   * 
   */
  static filterChildNodes(parent, list, filter, callback) {

    if (list === undefined) {
      list = [];
    }

    if (filter(parent)) {
      list.push(parent);
    }

    if (!parent.isContainer) {
      return callback(null, list);
    }

    if (!parent.childrenIds) {
      if (!parent.refID) {
        // TODO follow links ?
      }
      return callback(null, list);
    }

    var service = parent._service;

    Async.eachSeries(parent.childrenIds, (childId, callback) => {
      service.getNodeById(childId, (error, child) => {
        if (error) {
          return callback(error);
        }

        if (!child) {
          return callback(null);
        }

        Node.filterChildNodes(child, list, filter, callback);
      });

    }, (error) => {
      if (error) {
        logger.error("Filter childNodes error",error);
      }
      callback(error, list);
    });
  }

  /**
   * 
   */
  get parentId() {
    return this._parentId;
  }
  /**
   * 
   */
  get path() {
    return this._path;
  }

  /**
   * 
   */
  get service() {
    return this._service;
  }

  /**
   * 
   */
  getParentNode(callback) {
    if (!this._parentId) {
      return callback(null, null);
    }

    var service = this._service;

    service.getNodeById(this._parentId, callback);
  }

  /**
   * 
   */
  getFirstChildByName(name, callback) {
    this.eachChild((node) => {
      if (debugChildByName.enabled) {
        debugChildByName("getFirstChildByName #", this._id, "name=", name, "=>", node._id);
      }

      if (node.name) {
        return (node.name === name);
      }

      return undefined;

    }, callback);
  }

  /**
   * 
   */
  listChildrenByTitle(title, callback) {
    var children=[];
    var links=[];
    this.eachChild((node, link) => {
      var ntitle = (node.attributes && node.attributes.title) || node.name;

      if (ntitle !== title) {
        if (!link || node===link) {
          return;
        }

        ntitle = (link.attributes && link.attributes.title) || link.name;
        if (ntitle !== title) {
          return;
        }
      }

      links.push(link);
      children.push(node);

    }, (error) => {
      if (error) {
        return callback(error);
      }

      callback(null, children, links);
    });
  }

  /**
   * 
   */
  eachChild(testFunc, callback) {
    this.listChildren((error, children) => {
      if (error) {
        return callback(error);
      }

      var links=[];

      for (var i = 0; i < children.length; i++) {
        var child = children[i];

        var test = testFunc(child, child);
        if (test) {
          return callback(null, child);
        }

        if (child.refID) {
          links.push(child);
          continue;
        }
      }

      if (!links.length) {
        if (debugChildByName) {
          debugChildByName("eachChild #", this._id, "=> NO RESULT (no links)");
        }

        return callback();
      }

      var stopError="STOP";
      var found;
      Async.eachSeries(links, (link, callback) => {

        link.resolveLink((error, node) => {
          if (error) {
            return callback(error);
          }

          if (testFunc(node, link)) {
            found=link;
            return callback(stopError); // Use Error to stop the loop
          }

          callback();
        });
      }, (error) => {
        if (found) {
          return callback(null, found);
        }

        if (debugChildByName) {
          debugChildByName("eachChild #", this._id, "=> NOT FOUND");
        }

        if (error && error!==stopError) {
          logger.error("Can not find child", error);
          return callback(error);
        }

        callback();
      });
    });
  }

  /**
   * 
   */
  resolveLink(callback) {
    if (!this.refID) {
      return callback(null, this);
    }

    this._service.getNodeById(this.refID, (error, child) => {
      if (error) {
        return callback(error);
      }

      child.resolveLink(callback);
    });
  }

  /**
   * 
   */
  addSearchClass(searchClass, includeDerived) {

    var searchClasses = this.searchClasses;
    if (!searchClasses) {
      searchClasses = [];
      this.searchClasses = searchClasses;
    }

    for (var i = 0; i < searchClasses.length; i++) {
      var sc = searchClasses[i];
      if (sc.name !== searchClass) {
        continue;
      }

      sc.includeDerived = sc.includeDerived || includeDerived;

      return;
    }

    searchClasses.push({
      name : searchClass,
      includeDerived : includeDerived
    });
  }

  /**
   * 
   */
  treeString(callback) {
    return this._treeString("", callback);
  }

  /**
   * 
   */
  _treeString(indent, callback) {
    // logger.debug("TreeString " + this);

    indent = indent || "";

    var s = indent + "# " + this + "\n";
    if (!this.isContainer) {
      return callback(null, s);
    }

    indent += "  ";
    if (!this.childrenIds) {
      if (!this.refID) {
        s += indent + "<Unknown children>\n";
      }
      return callback(null, s);
    }

    var service = this._service;

    Async.eachSeries(this.childrenIds, (childId, callback) => {
      service.getNodeById(childId, (error, child) => {
        if (error) {
          return callback(error);
        }

        if (!child) {
          s += "<NULL>";
          return callback(null);
        }

        child._treeString(indent, (error, s2) => {
          if (s2) {
            s += s2;
          }

          callback(null);
        });
      });

    }, (error) => callback(error, s));
  }

  /**
   * 
   */
  getAttributes(options, callback) {
    if (arguments.length === 1) {
      callback = options;
      options = undefined;
    }

    if (!options) {
      options = ContentDirectoryService.SYNC_PRIORITY;

    } else if (typeof (options) === "object" &&
        typeof (options.priority) !== "number") {
      options.priority = ContentDirectoryService.SYNC_PRIORITY;
    }

    debug("Requesting prepare node #",this._id," options=",options);

    this._service.prepareNodeAttributes(this, options, (error, node) => {

      debug("Requesting prepare node #",this._id," returns error=",error);

      if (error) {
        if (!callback) {
          logger.error(error);
          return;
        }
        return callback(error);
      }

      assert(node.attributes, "Node's attributes are null");

      if (callback) {
        callback(null, node.attributes);
      }
    });
  }

  /**
   * 
   */
  toString() {
    var s = "[Node id=" + this._id;

    // s += " path=" + this.path;

    if (this.upnpClass) {
      s += " upnpClass='" + this.upnpClass + "'";
    }

    if (this.name) {
      s += " name='" + this.name + "'";
    }

    if (this.refID) {
      s += " refID=" + this.refID;
    }

    return s + "]";
  }

  /**
   * 
   */
  takeLock(lockName, callback) {
    var semaphores = this._semaphores;
    if (!semaphores) {
      semaphores = {};
      this._semaphores = semaphores;
    }
    var semaphore = semaphores[lockName];
    if (!semaphore) {
      semaphore = new Semaphore("Node#"+this._id+":"+lockName);
      semaphores[lockName] = semaphore;
    }

    semaphore.take(callback);
  }

  /**
   * 
   */
  leaveLock(lockName) {
    var semaphores = this._semaphores;
    if (!semaphores) {
      throw new Error("Invalid Semaphores context");
    }
    var semaphore = semaphores[lockName];
    if (!semaphore) {
      throw new Error("Invalid Semaphore context '" + lockName + "'");
    }

    semaphore.leave();
  }

  /**
   * 
   */
  _isLocked() {
    var semaphores = this._semaphores;
    if (!semaphores) {
      return false;
    }
    for ( var k in semaphores) {
      var semaphore = semaphores[k];
      if (semaphore.current) {
        return k;
      }
    }

    return false;
  }
}

module.exports = Node;
