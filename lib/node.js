/*jslint node: true, plusplus: true, nomen: true, vars: true, sub: true */
/*global setImmediate*/
"use strict";

var assert = require('assert');
var Async = require("async");
var Semaphore = require('semaphore');
var Util = require("util");

var Item = require('./class/object.item');
var ContentDirectoryService = require('./contentDirectoryService');

var debugFactory = require('debug');
var debug = debugFactory('upnpserver:node');
var debugGarbage = debugFactory('upnpserver:garbage');

var logger = require('./logger');

var emptyMap = {};

var LOG_LIST_CHILDREN = false;
var LOG_GET_CHILD_BYNAME = false;

var LIST_CHILDREN_LIMIT = 4;

var VERIFY_UNIQUE_KEY = false; // {};

var Node = function(service, id) {
  assert(service, "Service is undefined !");
  assert(id !== undefined, "ID must be defined");

  if (VERIFY_UNIQUE_KEY) {
    if (VERIFY_UNIQUE_KEY[id]) {
      console.error("************************** SAME KEY " + id);
      throw new Error("Invalid key '" + id + "'");
    }
    VERIFY_UNIQUE_KEY[id] = true;
  }

  this.id = id;
  this.service = service;
};

Node.createRef = function(linkedNode, name, callback) {

  linkedNode.service.allocateNodeId(function(error, id) {
    if (error) {
      return callback(error);
    }

    var node = new Node(linkedNode.service, id);

    node.refID = linkedNode.id;
    node.prepared = false;

    if (name) {
      node.name = name;
    }

    if (debug.enabled) {
      debug("NewNodeRef id=#" + node.id + " name=" + name + " linkedName=" +
          linkedNode.name);
    }

    linkedNode.appendLink(node, function(error) {
      callback(error, node);
    });
  });
};

Node.create = function(service, name, upnpClass, attributes, callback) {

  service.allocateNodeId(function(error, id) {
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
      debug("NewNode id=#" + node.id + " name=" + name + " upnpClass=" +
          upnpClass);
    }

    callback(null, node);
  });
};

module.exports = Node;

Node.prototype.removeChild = function(child, callback) {

  var childrenIds = this.childrenIds;
  if (!childrenIds) {
    var ex = new Error("The node has no children");
    ex.node = this;
    ex.child = child;
    return callback(ex);
  }

  var idx = childrenIds.indexOf(child.id);
  if (idx < 0) {
    var ex = new Error("Can not find child #" + child.id);
    ex.node = this;
    ex.child = child;
    return callback(ex);
  }

  if (child.childrenIds && child.childrenIds.length) {
    var ex = new Error("Can not remove child #" + child.id +
        " if its contains children");
    ex.node = this;
    ex.child = child;
    return callback(ex);
  }

  var service = this.service;
  var self = this;

  this._take("children", function() {
    idx = childrenIds.indexOf(child.id);
    if (idx < 0) {
      self._leave("children");

      return callback();
    }

    self.childrenIds.splice(idx, 1);
    self.updateId++;

    delete child.path;
    delete child.parentId;

    service.saveNode(self, {
      updateId : self.updateId,
      $pull : {
        childrenIds : child.id
      }

    }, function(error) {
      if (error) {
        console.error("Can not save node #", self.id, error);
        self._leave("children");
        return callback(error);
      }

      service.registerUpdate(self);

      var refID = child.refID;

      service.unregisterNode(child, function(error) {
        if (error) {
          console.error("Can not unregister node #", child.id, error);
          self._leave("children");
          return callback(error);
        }

        self._leave("children");

        if (!refID) {
          return callback();
        }

        self.service.getNodeById(refID, function(error, refNode) {
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
};

Node.prototype.removeLink = function(child, callback) {
  var self = this;

  this._take("links", function() {
    var linkedIds = self.linkedIds;
    if (!linkedIds) {
      self._leave("links");
      return callback(new Error("Node has no links"));
    }

    var idx = linkedIds.indexOf(child.id);
    if (idx < 0) {
      self._leave("links");
      return callback(new Error("Can not find link"));
    }

    linkedIds.splice(idx, 1);

    self.service.saveNode(self, {
      $pull : {
        linkedIds : child.id
      }

    }, function(error) {
      self._leave("links");

      callback(error, self);
    });
  });
};

Node.prototype.appendLink = function(child, callback) {
  var self = this;

  self._take("links", function() {
    var linkedIds = self.linkedIds;

    if (!linkedIds) {
      linkedIds = [];
      self.linkedIds = linkedIds;
    }

    linkedIds.push(child.id);

    self.service.saveNode(self, {
      $push : {
        linkedIds : child.id
      }

    }, function(error) {
      self._leave("links");

      callback(error, self);
    });
  });
};

Node.prototype.appendChild = function(child, callback) {
  this.insertBefore(child, null, callback);
};

Node.prototype.insertBefore = function(child, before, callback) {
  if (debug.enabled) {
    debug("InsertBefore parent=#", this.id, " child=#", child.id, " before=#",
        (before ? before.id : null));
  }

  if (typeof (child.parentId) === "number") {
    var ex = new Error("Can not add a child which has already a parent !");
    ex.node = this;
    return callback(ex);
  }

  var self = this;
  var service = this.service;

  this._take("children", function() {

    child.parentId = self.id;

    var childrenIds = self.childrenIds;
    if (!childrenIds) {
      childrenIds = [];
      self.childrenIds = childrenIds;
    }

    var idx = childrenIds.length;

    if (typeof (before) === "number") {
      if (before > idx) {
        var ex = new Error("Before index overflow idx=" + before);
        ex.node = this;

        self._leave("children");
        return callback(ex);
      }
      idx = before;

    } else if (before) {
      idx = childrenIds.indexOf(before.id);
      if (idx < 0) {
        var ex = new Error("Before child #" + before.id + " is not found");
        ex.node = this;

        self._leave("children");
        return callback(ex);
      }
    }

    childrenIds.splice(idx, 0, child.id);
    self.updateId++;

    var childModifications = {
      parentId : child.parentId
    };

    if (!self.path) {
      // Node is not connected to the root !
      console.error("**** Not connected to the root ? #" + self.id, "name=",
          self.name, "refId=", self.refID, "attributes=", self.attributes);

    } else {
      // Connected to root
      var ps = [ self.path ];
      if (self.path !== "/") {
        ps.push("/");
      }
      ps.push(child.name ? child.name : child.id);

      child.path = ps.join('');

      childModifications.path = child.path;
    }

    var nodeModifications = {
      updateId : self.updateId
    };

    if (before) {
      nodeModifications.childrenIds = childrenIds;
    } else {
      nodeModifications.$push = {
        childrenIds : child.id
      };
    }

    service.saveNode(self, nodeModifications, function(error) {
      if (error) {
        console.error("Can not save node #", self.id, error);
        self._leave("children");
        return callback(error);
      }

      service.saveNode(child, childModifications, function(error) {
        if (error) {
          console.error("Can not save child node #", child.id, error);
          self._leave("children");
          return callback(error);
        }

        service.registerUpdate(self);

        self._leave("children");
        callback(null, self);
      });
    });
  });
};

Node.prototype.toJSONObject = function() {
  var obj = {
    id : this.id,
    parentId : this.parentId
  };

  if (this.name) {
    obj.name = this.name;
  }
  if (this.path) {
    obj.path = this.path;
  }

  if (this.upnpClass) {
    obj.upnpClass = this.upnpClass.name;
  }

  if (this.updateId) {
    obj.updateId = this.updateId;
  }
  if (this.prepared === true) {
    obj.prepared = true;
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

  return obj;
};

Node.fromJSONObject = function(service, obj) {

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

  if (obj.prepared) {
    node.prepared = true;
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
    node.path = obj.path;
  }
  if (obj.childrenIds) {
    node.childrenIds = obj.childrenIds;
  }
  if (obj.linkedIds) {
    node.linkedIds = obj.linkedIds;
  }

  return node;
};

Node.prototype.listChildren = function(options, callback) {
  if (arguments.length === 1) {
    callback = options;
    options = undefined;
  }

  var resolveLinks = options && options.resolveLinks;
  var canUseCache = !resolveLinks;

  assert(this.upnpClass.isContainer, "Node is not a container  (id=" + this.id +
      ")");
  if (!this.upnpClass.isContainer) {
    if (LOG_LIST_CHILDREN) {
      logger.debug("Node.listChildren[" + this + "]  => No container");
    }
    return callback(null, null);
  }

  var self = this;
  var service = this.getService();

  this._take("children", function() {

    if (canUseCache) {
      var cache = service._childrenWeakHashmap.get(self.id, self);
      if (cache) {
        cache = cache.slice(0); // Clone list

        self._leave("children");
        return callback(null, cache);
      }
    }

    var getNodeFunc = function(id, callback) {
      service.getNodeById(id, callback);
    };
    if (resolveLinks) {
      var old = getNodeFunc;
      getNodeFunc = function(id, callback) {
        old(id, function(error, node) {
          if (error) {
            return callback(error);
          }

          node.resolveLink(callback);
        });
      };
    }

    var childrenIds = self.childrenIds;

    if (childrenIds !== undefined) {
      if (LOG_LIST_CHILDREN) {
        debug("Node.listChildren #", self.id, "=> cached ids list ",
            childrenIds.length, childrenIds);
      }

      Async.mapLimit(childrenIds, LIST_CHILDREN_LIMIT, function(id, callback) {
        getNodeFunc(id, function(error, node) {
          if (error) {
            console.error(error, error.stack);
          }
          if (!node) {
            var mapError = new Error("Can not convert #" + id);
            return callback(mapError);
          }

          callback(null, node);
        });
      },
          function(error, result) {

            if (error) {
              console.error(error, error.stack);
              if (debug.enabled) {
                debug("Node.listChildren[" + self + "] => map returs error ",
                    error);
              }

              self._leave("children");
              return callback(error);
            }

            if (LOG_LIST_CHILDREN) {
              logger.debug("Node.listChildren[" + self + "] => map returs " +
                  result);
            }

            if (canUseCache) {
              service._childrenWeakHashmap.put(self, result);
            }

            self._leave("children");
            callback(null, result);
          });
      return;
    }

    if (LOG_LIST_CHILDREN) {
      debug("Node.listChildren #" + self.id + "=> not in cache !");
    }

    service.browseNode(self, function(error, list) {

      if (error) {
        self._leave("children");
        return callback(error);
      }

      if (LOG_LIST_CHILDREN) {
        debug("Node.listChildren #", self.id, "=>", list);
      }

      if (canUseCache) {
        service._childrenWeakHashmap.put(self, list);
      }

      self._leave("children");
      return callback(null, list);
    });
  });
};

Node.prototype.filterChildNodes = function(parent, list, filter, callback) {

  var self = this;
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

  var service = parent.getService();

  Async.eachSeries(parent.childrenIds, function(childId, callback) {
    service.getNodeById(childId, function(error, child) {
      if (error) {
        return callback(error);
      }

      if (!child) {
        return callback(null);
      }

      self.filterChildNodes(child, list, filter, callback);
    });

  }, function(error) {
    callback(error, list);
  });
};

Node.prototype.getPath = function() {
  return this.path;
};

Node.prototype.getService = function() {
  return this.service;
};

Node.prototype.getParent = function(callback) {
  if (!this.parentId) {
    return callback(null, null);
  }

  var service = this.getService();

  return service.getNodeById(this.parentId, callback);
};

Node.prototype.getChildByName = function(name, callback) {
  var self = this;

  this.findChild(function(node) {
    if (LOG_GET_CHILD_BYNAME) {
      debug("Node.getChildByName #", self.id, "name=", name, "=>", node.id);
    }

    if (node.name) {
      return (node.name === name);
    }

    return undefined;

  }, callback);
};

Node.prototype.getChildByTitle = function(title, callback) {
  var self = this;

  this.findChild(function(node) {
    var ntitle = (node.attributes && node.attributes.title) || node.name;

    if (ntitle) {
      return (ntitle === title);
    }

    return undefined;

  }, callback);
};

Node.prototype.findChild = function(testFunc, callback) {
  var self = this;

  this.listChildren(function(error, children) {
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
        logger.debug("Node.getChildByName[" + self + "] (" + name +
            ") => NO RESULT");
      }

      return callback();
    }

    Async.eachSeries(links, function(link, callback) {

      link.resolveLink(function(error, node) {
        if (error) {
          return callback(error);
        }

        if (testFunc(node)) {
          return callback(link); // Use Error to stop the loop
        }

        callback();
      });
    }, function(node) {
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
};

Node.prototype.resolveLink = function(callback) {
  if (!this.refID) {
    return callback(null, this);
  }

  this.service.getNodeById(this.refID, function(error, child) {
    if (error) {
      return callback(error);
    }

    child.resolveLink(callback);
  });
};

Node.prototype.addSearchClass = function(searchClass, includeDerived) {

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
};
/*
 * Node.prototype.setDate = function(date) { if (!date) { this._date = undefined; return; } this._date = Node.toISODate(date); };
 * 
 * Node.toISODate = function(date) { return date.toISOString().replace(/\..+/, ''); };
 */

Node.prototype.treeString = function(callback) {
  return this._treeString("", callback);
};

Node.prototype._treeString = function(indent, callback) {
  // logger.debug("TreeString " + this);

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

  var service = this.getService();

  Async.eachSeries(this.childrenIds, function(childId, callback) {
    service.getNodeById(childId, function(error, child) {
      if (error) {
        return callback(error);
      }

      if (!child) {
        s += "<NULL>";
        return callback(null);
      }

      child._treeString(indent, function(error, s2) {
        if (s2) {
          s += s2;
        }

        callback(null);
      });
    });

  }, function(error) {
    callback(error, s);
  });
};

Node.prototype.refresh = function(callback) {
  if (debug.enabled) {
    debug("Update item itemId=" + this.id + " name=" + this.name);
  }
  this.getService().refreshNode(this, callback);
};

Node.prototype.garbage = function(callback) {

  var service = this.getService();

  if (!this.childrenIds) {
    if (callback) {
      callback();
    }
    return;
  }

  var self = this;
  Async.each(this.childrenIds, function(child, callback) {
    service.getNodeById(child, function(error, item) {
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
      self.updateId++;
      service.registerUpdate(self);

      item._garbageChild(callback);
    });

  }, function(error) {
    if (callback) {
      callback(error);
    }
  });
};

Node.prototype.getAttributes = function(options, callback) {

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

  this.service.prepareNodeAttributes(this, options, function(error, node) {
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
};

Node.prototype._garbageChild = function(callback) {

  var service = this.getService();

  if (!this.upnpClass.isContainer || !this.childrenIds) {
    if (debugGarbage.enabled) {
      debugGarbage("Garbage id " + this.id + " " + this.name);
    }
    return service.unregisterNode(this, callback);
  }

  var self = this;
  Async.each(this.childrenIds, function(child, callback) {
    service.getNodeById(child, function(error, item) {
      if (error) {
        return callback(error);
      }

      item._garbageChild(callback);
    });

  }, function(error) {
    if (error) {
      return callback(error);
    }

    self.childrenIds = null;

    if (debugGarbage.enabled) {
      debugGarbage("Garbage id " + self.id + " " + self.name);
    }

    return service.unregisterNode(self, callback);
  });
};

Node.prototype.toString = function() {
  var s = "[Node id=" + this.id;

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
};

Node.prototype._take = function(lockName, callback) {
  var semaphores = this._semaphores;
  if (!semaphores) {
    semaphores = {};
    this._semaphores = semaphores;
  }
  var semaphore = semaphores[lockName];
  if (!semaphore) {
    semaphore = Semaphore(1);
    semaphores[lockName] = semaphore;
  }

  semaphore.take(callback);
};

Node.prototype._leave = function(lockName) {
  var semaphores = this._semaphores;
  if (!semaphores) {
    throw new Error("Invalid Semaphores context");
  }
  var semaphore = semaphores[lockName];
  if (!semaphore) {
    throw new Error("Invalid Semaphore context '" + lockName + "'");
  }

  semaphore.leave();
  if (!semaphore.current) {
    delete semaphores[lockName];
  }
};

Node.prototype.getRes = function(index) {
  index = index || 0;
  this.attributes.res = this.attributes.res || [];
  var res = this.attributes.res;
  var r = res[index];
  if (!r) {
    r = {};
    res[index] = r;
  }
  return r;
};

Node.prototype.newRes = function(r) {
  this.getRes();
  r = r || {};
  this.attributes.res.push(r);
  return r;
};

Node.prototype._isReleasable = function() {
  var semaphores = this._semaphores;
  if (!semaphores) {
    return true;
  }
  for ( var k in semaphores) {
    var semaphore = semaphores[k];
    if (semaphore.current) {
      return k;
    }
  }

  return true;
};
