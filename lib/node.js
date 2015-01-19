/*jslint node: true, plusplus: true, nomen: true, vars: true */
/*global setImmediate*/
"use strict";

var assert = require('assert');
var Util = require("util");
var Async = require("async");
var _ = require('underscore');

var logger = require('./logger');

// IT MUST START AT 0 because UPNP ROOT must have id 0
var itemIndex = 0;
var emptyMap = {};

var LOG_LIST_CHILDREN = false;
var LOG_GET_CHILD_BYNAME = false;

var Node = function() {
};

Node.createRef = function(parent, nodeRef, name, attributes) {
  if (!name) {
    name = nodeRef.name;
  }

  var node = Node.create(parent, name, nodeRef.upnpClass, nodeRef.container,
      attributes);
  node.refID = nodeRef.id;

  return node;
};

Node.create = function(parent, name, upnpClass, isContainer, attributes) {
  var item = new Node();

  item.id = itemIndex++;

  if (name) {
    item.name = name;
  }

  assert(typeof (upnpClass) === "string", "UpnpClass must be a string");
  item.upnpClass = upnpClass;

  if (isContainer) {
    item.container = true;
  }
  var atts = emptyMap;
  if (attributes) {
    atts = {};
    _.extend(atts, attributes);
  }
  item.attributes = atts;
  item.itemUpdateId = 0;

  if (atts.virtual) {
    item.virtual = true;
  }

  if (parent) {
    item.path = parent.path + ((parent.path !== "/")
        ? "/" : "") + (name
        ? name : item.id);
    item.parentId = parent.id;
    item.service = parent.service;

    if (!parent._childrenIds) {
      parent._childrenIds = [];
    }

    parent._childrenIds.push(item.id);
    parent.itemUpdateId++;
    item.service.registerUpdate(item);

  } else {
    item.path = "/";
    item.parentId = -1;
    item.id = 0; // Force Id to 0
  }

  logger.debug("NewNode id=" + item.id + " parent=" + item.parentId + " name=" +
      name + " upnpClass=" + upnpClass + " container=" + isContainer);

  return item;
};

module.exports = Node;

Node.prototype.toJSON = function() {
  var obj = {
    name : this.name,
    upnpClass : this.upnpClass,
    itemUpdateId : this.itemUpdateId,
    parentID : this.parentId
  };
  if (this.refID) {
    obj.refID = this.refID;
  }
  if (this.attributes !== emptyMap) {
    obj.attributes = this.attributes;
  }
  if (this.container) {
    obj.container = true;
  }
  if (this.virtual) {
    obj.virtual = true;
  }
  if (this._childrenIds) {
    obj.childrenIds = this._childrenIds;
  }

  return JSON.stringify(obj);
};

Node.fromChildJSON = function(string) {

  var obj = JSON.parse(string);

  var parentId = obj.parentId;

  var item = new Node();
  item.name = obj.name;
  item.upnpClass = obj.upnpClass;
  item.attributs = obj.attributes;
  item.itemUpdateId = obj.itemUpdateId;
  if (obj.refID) {
    item.refID = obj.refID;
  }
  if (obj.container) {
    item.container = true;
  }
  if (obj.virtual) {
    item.virtual = true;
  }
  if (obj._childrenIds) {
    item._childrenIds = obj.childrenIds;
  }
  item.attributes = (obj.attributes
      ? obj.attributes : emptyMap);

  item.parentId = this.id;
  item.path = this.path + ((this.path !== "/")
      ? "/" : "") + obj.name;
  item.service = this.service;

  return item;
};

Node.prototype.listChildren = function(callback) {
  var self = this;

  var service = this.getService();

  var cache = service._childrenWeakHashmap.get(this);
  if (cache) {
    return callback(null, cache);
  }

  if (this._locked) {
    setImmediate(function() {
      self.listChildren(callback);
    });
    return;
  }

  assert(this.container, "Node is not a container  (id=" + this.id + ")");
  if (!this.container) {
    if (LOG_LIST_CHILDREN) {
      logger.debug("Node.listChildren[" + self + "]  => No container");
    }
    return callback(null, null);
  }

  this._locked = true;

  if (this._childrenIds !== undefined) {
    if (LOG_LIST_CHILDREN) {
      logger.debug("Node.listChildren[" + self + "]  => cache ",
          this._childrenIds.length);
    }

    Async.mapLimit(this._childrenIds, 4, function(id, callback) {
      service.getNodeById(id, callback);
    },
        function(error, result) {
          self._locked = undefined;

          if (error) {
            logger.debug(
                "Node.listChildren[" + self + "] => map returs error ", error);
            return callback(error);
          }

          if (LOG_LIST_CHILDREN) {
            logger.debug("Node.listChildren[" + self + "] => map returs " +
                result);
          }

          service._childrenWeakHashmap.put(self, result);

          callback(null, result);
        });
    return;
  }

  if (LOG_LIST_CHILDREN) {
    logger.debug("Node.listChildren[" + self + "] => not in cache !");
  }

  // this._childrenIds = [];
  service.browseNode(this, function(error, list) {
    self._locked = undefined;

    if (error) {
      return callback(error);
    }

    if (LOG_LIST_CHILDREN) {
      logger.debug("Node.listChildren[" + self + "] => ", list);
    }

    service._childrenWeakHashmap.put(self, list);

    return callback(null, list);
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

  this.listChildren(function(error, children) {
    if (error) {
      logger.debug(
          "Node.getChildByName[" + self + "] (" + name + ") => error ", error);
      return callback(error);
    }

    var found = null;
    children.forEach(function(child) {
      if (child.name === name) {
        found = child;
        return false;
      }
    });

    if (LOG_GET_CHILD_BYNAME) {
      logger.debug("Node.getChildByName[" + self + "] (" + name + ") => find " +
          found);
    }

    return callback(null, found);
  });
};

Node.prototype.addSearchClass = function(searchClass, includeDerived) {
  if (!this.searchClasses) {
    this.searchClasses = [];
  }

  this.searchClasses.push({
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
  if (!this.container) {
    return callback(null, s);
  }

  indent += "  ";
  if (!this._childrenIds) {
    if (!this.refID) {
      s += indent + "<Unknown children>\n";
    }
    return callback(null, s);
  }

  var service = this.getService();

  Async.eachSeries(this._childrenIds, function(childId, callback) {
    service.getNodeById(childId, function(error, child) {
      if (error) {
        return callback(error);
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

Node.prototype.update = function(callback) {
  logger.debug("Update item itemId=" + this.id + " name=" + this.name);

  // this.getService().updateNode(this, callback);
  callback(null);
};

Node.prototype.garbage = function(callback) {

  var service = this.getService();

  if (!this._childrenIds) {
    if (callback) {
      callback();
    }
    return;
  }

  var self = this;
  Async.each(this._childrenIds, function(child, callback) {
    service.getNodeById(child, function(error, item) {
      if (error || !item) {
        return callback(error);
      }

      if (item.virtual) {
        if (!item.container) {
          return callback(null);
        }
        return item.garbage(callback);
      }

      // clean it ! (remove all children for reload)
      self.itemUpdateId++;
      service.registerUpdate(self);

      item._garbageChild(callback);
    });

  }, function(error) {
    if (callback) {
      callback(error);
    }
  });
};

Node.prototype._garbageChild = function(callback) {

  var service = this.getService();

  if (!this.container || !this._childrenIds) {
    console.log("Garbage id " + this.id + " " + this.name);
    return service.removeNodeById(this.id, callback);
  }

  var self = this;
  Async.each(this._childrenIds, function(child, callback) {
    service.getNodeById(child, function(error, item) {
      item._garbageChild(callback);
    });

  }, function(error) {
    if (error) {
      return callback(error);
    }

    self._childrenIds = null;

    console.log("Garbage id " + self.id + " " + self.name);

    return service.removeNodeById(self.id, callback);
  });
};

Node.prototype.toString = function() {
  var s = "[Node id=" + this.id + " class='" + this.upnpClass + "'";

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
