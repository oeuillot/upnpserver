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
const debugGarbage = debugFactory('upnpserver:garbage');

const logger = require('./logger');

const emptyMap = {};

const LOG_LIST_CHILDREN = false;
const LOG_GET_CHILD_BYNAME = false;

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
        console.error("************************** SAME KEY " + id);
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

    linkedNode._service.allocateNodeId((error, id) => {
      if (error) {
        return callback(error);
      }

      var node = new Node(linkedNode._service, id);

      node.refID = linkedNode._id;
      node.prepared = false;

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

      node.updateId = 0;

      if (attributes && attributes.virtual) {
        node.virtual = true;
      }

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

    this._take("children", () => {
      idx = childrenIds.indexOf(child._id);
      if (idx < 0) {
        this._leave("children");

        return callback();
      }

      this.childrenIds.splice(idx, 1);
      this.updateId++;

      delete child._path;
      delete child.parentId;

      service.saveNode(this, {
        updateId : this.updateId,
        $pull : {
          childrenIds : child._id
        }

      }, (error) => {
        if (error) {
          console.error("Can not save node #", this._id, error);
          this._leave("children");
          return callback(error);
        }

        service.registerUpdate(this);

        var refID = child.refID;

        service.unregisterNode(child, (error) => {
          if (error) {
            console.error("Can not unregister node #", child._id, error);
            this._leave("children");
            return callback(error);
          }

          this._leave("children");

          if (!refID) {
            return callback();
          }

          service.getNodeById(refID, (error, refNode) => {
            if (error) {
              console.error("Can not find linked node #", refID, error);
              return callback(error);
            }

            refNode.removeLink(child);

            callback();
          });
        });
      });
    });
  }

  removeLink(child, callback) {
    this._take("links", () => {
      var linkedIds = this.linkedIds;
      if (!linkedIds) {
        this._leave("links");
        return callback(new Error("Node has no links"));
      }

      var idx = linkedIds.indexOf(child._id);
      if (idx < 0) {
        this._leave("links");
        return callback(new Error("Can not find link"));
      }

      linkedIds.splice(idx, 1);

      this._service.saveNode(this, {
        $pull : {
          linkedIds : child._id
        }

      }, (error) => {
        this._leave("links");

        callback(error, this);
      });
    });
  }

  appendLink(child, callback) {
    this._take("links", () => {
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
        this._leave("links");

        callback(error, this);
      });
    });
  }

  appendChild(child, callback) {
    this.insertBefore(child, null, callback);
  }

  insertBefore(child, before, callback) {
    if (debug.enabled) {
      debug("InsertBefore parent=#", this._id, " child=#", child._id, " before=#",
          (before ? before._id : null));
    }

    if (typeof (child.parentId) === "number") {
      var ex = new Error("Can not add a child which has already a parent !");
      ex.node = this;
      return callback(ex);
    }

    var service = this._service;

    this._take("children", () => {

      child.parentId = this._id;

      var childrenIds = this.childrenIds;
      if (!childrenIds) {
        childrenIds = [];
        this.childrenIds = childrenIds;
      }

      var idx = childrenIds.length;

      if (typeof (before) === "number") {
        if (before > idx) {
          let ex = new Error("Before index overflow idx=" + before);
          ex.node = this;

          this._leave("children");
          return callback(ex);
        }
        idx = before;

      } else if (before) {
        idx = childrenIds.indexOf(before._id);
        if (idx < 0) {
          let ex = new Error("Before child #" + before._id + " is not found");
          ex.node = this;

          this._leave("children");
          return callback(ex);
        }
      }

      childrenIds.splice(idx, 0, child._id);
      this.updateId++;

      var childModifications = {
          parentId : child.parentId
      };

      if (!this._path) {
        // Node is not connected to the root !
        console.error("**** Not connected to the root ? #" + this._id, "name=",
            this.name, "refId=", this.refID, "attributes=", this.attributes);

      } else {
        // Connected to root
        var ps = [ this._path ];
        if (this._path !== "/") {
          ps.push("/");
        }
        ps.push(child.name ? child.name : child._id);

        child._path = ps.join('');

        childModifications._path = child._path;
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
          console.error("Can not save node #", this._id, error);
          this._leave("children");
          return callback(error);
        }

        service.saveNode(child, childModifications, (error) => {
          if (error) {
            console.error("Can not save child node #", child._id, error);
            this._leave("children");
            return callback(error);
          }

          service.registerUpdate(this);

          this._leave("children");
          callback(null, this);
        });
      });
    });
  }

  toJSONObject() {
    var obj = {
        id : this._id,
        parentId : this.parentId
    };

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
      obj.refID = this.refID;
    }
    if (this.attributes && this.attributes !== emptyMap) {
      obj.attributes = this.attributes;
    }
    if (this.childrenIds) {
      obj.childrenIds = this.childrenIds;
    }
    if (this.linkedIds) {
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

  static fromJSONObject(service, obj) {

    var node = new Node(service, obj.id);
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
    if (obj.refID) {
      node.refID = obj.refID;
    }
    if (node.attributes.virtual) {
      node.virtual = true;
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

  listChildren(options, callback) {
    if (arguments.length === 1) {
      callback = options;
      options = undefined;
    }

    var resolveLinks = options && options.resolveLinks;
    var canUseCache = !resolveLinks;

    assert(this.upnpClass.isContainer, "Node is not a container  (id=" + this._id +
    ")");
    if (!this.upnpClass.isContainer) {
      if (LOG_LIST_CHILDREN) {
        logger.debug("Node.listChildren[" + this + "]  => No container");
      }
      return callback(null, null);
    }

    var service = this._service;

    this._take("children", () => {

      if (canUseCache) {
        var cache = service._childrenWeakHashmap.get(this._id, this);
        if (cache) {
          cache = cache.slice(0); // Clone list

          this._leave("children");
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
        if (LOG_LIST_CHILDREN) {
          debug("Node.listChildren #", this._id, "=> cached ids list ",
              childrenIds.length, childrenIds);
        }

        Async.mapLimit(childrenIds, LIST_CHILDREN_LIMIT, (id, callback) => {
          getNodeFunc(id, (error, node) => {
            if (error) {
              console.error(error, error.stack);
            }
            if (!node) {
              var mapError = new Error("Can not convert #" + id);
              return callback(mapError);
            }

            callback(null, node);
          });

        }, (error, result) => {
          if (error) {
            console.error(error, error.stack);
            if (debug.enabled) {
              debug("Node.listChildren[#" + this._id+ "] => map returs error ",
                  error);
            }

            this._leave("children");
            return callback(error);
          }

          if (LOG_LIST_CHILDREN) {
            logger.debug("Node.listChildren[#" + this._id + "] => map returs " +
                result);
          }

          if (canUseCache) {
            service._childrenWeakHashmap.put(this, result);
          }

          this._leave("children");
          callback(null, result);
        });
        return;
      }

      if (LOG_LIST_CHILDREN) {
        debug("Node.listChildren #" + this._id + "=> not in cache !");
      }

      service.browseNode(this, (error, list) => {

        if (error) {
          this._leave("children");
          return callback(error);
        }

        if (LOG_LIST_CHILDREN) {
          debug("Node.listChildren #", this._id, "=>", list);
        }

        if (canUseCache) {
          service._childrenWeakHashmap.put(this, list);
        }

        this._leave("children");
        return callback(null, list);
      });
    });
  }

  filterChildNodes(parent, list, filter, callback) {

    if (list === undefined) {
      list = [];
    }

    if (filter(parent)) {
      list.push(parent);
    }

    if (!parent.upnpClass || !parent.upnpClass.isContainer) {
      return callback(null, list);
    }

    if (!parent.childrenIds) {
      if (!parent.refID) {
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

        this.filterChildNodes(child, list, filter, callback);
      });

    }, (error) => {
      callback(error, list);
    });
  }

  get path() {
    return this._path;
  }

  get service() {
    return this._service;
  }

  getParent(callback) {
    if (!this.parentId) {
      return callback(null, null);
    }

    var service = this._service;

    return service.getNodeById(this.parentId, callback);
  }

  getChildByName(name, callback) {
    this.findChild((node) => {
      if (LOG_GET_CHILD_BYNAME) {
        debug("Node.getChildByName #", this._id, "name=", name, "=>", node._id);
      }

      if (node.name) {
        return (node.name === name);
      }

      return undefined;

    }, callback);
  }

  getChildByTitle(title, callback) {
    this.findChild((node) => {
      var ntitle = (node.attributes && node.attributes.title) || node.name;

      if (ntitle) {
        return (ntitle === title);
      }

      return undefined;

    }, callback);
  }

  findChild(testFunc, callback) {
    this.listChildren((error, children) => {
      if (error) {
        return callback(error);
      }

      var links;

      for (var i = 0; i < children.length; i++) {
        var child = children[i];

        var test = testFunc(child);
        if (test) {
          return callback(null, child);
        }

        if (test === undefined && child.refID) {
          if (!links) {
            links = [];
          }
          links.push(child);
          continue;
        }
      }

      if (!links) {
        if (LOG_GET_CHILD_BYNAME) {
          logger.debug("Node.getChildByName[#" + this._id+ "] => NO RESULT");
        }

        return callback();
      }

      Async.eachSeries(links, (link, callback) => {

        link.resolveLink((error, node) => {
          if (error) {
            return callback(error);
          }

          if (testFunc(node)) {
            return callback(link); // Use Error to stop the loop
          }

          callback();
        });
      }, (node) => {
        if (node) {
          if (node.refID) {
            // It is the found node !
            return callback(null, node);
          }

          return callback(node);
        }

        callback();
      });
    });
  }

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
  /*
   * Node.prototype.setDate = function(date) { if (!date) { this._date = undefined; return; } this._date = Node.toISODate(date); };
   * 
   * Node.toISODate = function(date) { return date.toISOString().replace(/\..+/, ''); };
   */

  treeString(callback) {
    return this._treeString("", callback);
  }

  _treeString(indent, callback) {
    // logger.debug("TreeString " + this);

    console.log("TreeString #",this._id);
    
    indent = indent || "";

    var s = indent + "# " + this + "\n";
    if (!this.upnpClass || !this.upnpClass.isContainer) {
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

  refresh(callback) {
    if (debug.enabled) {
      debug("Update item itemId=" + this._id + " name=" + this.name);
    }
    this._service.refreshNode(this, callback);
  }

  garbage(callback) {

    var service = this._service;

    if (!this.childrenIds) {
      if (callback) {
        callback();
      }
      return;
    }

    Async.each(this.childrenIds, (child, callback) => {
      service.getNodeById(child, (error, item) => {
        if (error || !item) {
          return callback(error);
        }

        if (item.virtual) {
          if (!item.upnpClass.isContainer) {
            return callback(null);
          }
          return item.garbage(callback);
        }

        // clean it ! (remove all children for reload)
        this.updateId++;
        service.registerUpdate(this);

        item._garbageChild(callback);
      });

    }, (error) => {
      if (callback) {
        callback(error);
      }
    });
  }

  getAttributes(options, callback) {

    // console.log("getAttributes options:%s, callback:%s", Util.inspect(options), Util.inspect(callback));

    // object.container line 56 child.getAttributes(ContentDirectoryService.LOW_PRIORITY);
    // => getAttributes options:100, callback:undefined
    // so need to check if callback realy is a function

    if (arguments.length === 1 && typeof (options) === "function") {
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
          console.error(error);
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

  _garbageChild(callback) {

    var service = this._service;

    if (!this.upnpClass.isContainer || !this.childrenIds) {
      if (debugGarbage.enabled) {
        debugGarbage("Garbage id " + this._id + " " + this.name);
      }
      return service.unregisterNode(this, callback);
    }

    Async.each(this.childrenIds, (child, callback) => {
      service.getNodeById(child, (error, item) => {
        if (error) {
          return callback(error);
        }

        item._garbageChild(callback);
      });

    }, (error) => {
      if (error) {
        return callback(error);
      }

      this.childrenIds = null;

      if (debugGarbage.enabled) {
        debugGarbage("Garbage id #" + this._id + " " + this.name);
      }

      return service.unregisterNode(this, callback);
    });
  }

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

    } else if (this.attributes.virtual) {
      s += " VIRTUAL";
    }

    return s + "]";
  }

  /**
   * 
   */
  _take(lockName, callback) {
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
  _leave(lockName) {
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
