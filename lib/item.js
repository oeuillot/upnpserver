/*jslint node: true, plusplus: true, nomen: true, vars: true */
/*global setImmediate*/
"use strict";

var assert = require('assert');
var Util = require("util");
var Async = require("async");
var logger = require('./logger');

// IT MUST START AT 0 because UPNP ROOT must have id 0
var itemIndex = 0;
var emptyMap = {};

var LOG_LIST_CHILDREN = false;
var LOG_GET_CHILD_BYNAME = false;

var Item = function() {
};

Item.create = function(parent, name, upnpClass, isContainer, attributes,
    repositoryId) {
  var item = new Item();

  item.id = itemIndex++;

  item.name = name;
  
  assert(typeof (upnpClass) === "string", "UpnpClass must be a string");
  item.upnpClass = upnpClass;

  if (isContainer) {
    item.container = true;
  }
  if (repositoryId) {
    item.repositoryId = repositoryId;
  }
  var atts = emptyMap;
  if (attributes) {
    atts = {};
    for ( var k in attributes) {
      atts[k] = attributes[k];
    }
  }
  item.attributes = atts;
  item.itemUpdateId = 0;

  if (atts.virtual) {
    item.virtual = true;
  }

  if (parent) {
    item.path = parent.path + ((parent.path !== "/")
        ? "/" : "") + name;
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

  logger.debug("NewItem id=" + item.id + " parent=" + item.parentId + " name=" +
      name + " upnpClass=" + upnpClass + " container=" + isContainer +
      " repositoryId=" + repositoryId);

  return item;
};

Item.ITEM = "object.item";
Item.CONTAINER = "object.container";
Item.PERSON = Item.CONTAINER + ".person";
Item.GENRE = Item.CONTAINER + ".genre";
Item.STORAGE_FOLDER = Item.CONTAINER + ".storageFolder";
Item.VIDEO_FILE = Item.ITEM + ".videoItem";
Item.IMAGE_FILE = Item.ITEM + ".imageItem";
Item.IMAGE_PHOTO = Item.IMAGE_FILE + ".photo";
Item.AUDIO_FILE = Item.ITEM + ".audioItem";
Item.MUSIC_TRACK = Item.AUDIO_FILE + ".musicTrack";
Item.MUSIC_ARTIST = Item.PERSON + ".musicArtist";
Item.ALBUM_CONTAINER = Item.CONTAINER + ".album";
Item.MUSIC_ALBUM = Item.ALBUM_CONTAINER + ".musicAlbum";
Item.VIDEO_ALBUM = Item.ALBUM_CONTAINER + ".videoAlbum";
Item.PHOTO_ALBUM = Item.ALBUM_CONTAINER + ".photoAlbum";
Item.MUSIC_GENRE = Item.GENRE + ".musicGenre";
// Playlists should be: object.container.playlistContainer
// object.container.person.movieActor
// object.container.person.musicArtist

module.exports = Item;

Item.prototype.toJSON = function() {
  var obj = {
    name : this.name,
    upnpClass : this.upnpClass,
    itemUpdateId : this.itemUpdateId,
    parentId : this.parentId
  };
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

Item.fromChildJSON = function(string, itemRegistry) {

  var obj = JSON.parse(string);

  var parentId = obj.parentId;

  var item = new Item();
  item.name = obj.name;
  item.upnpClass = obj.upnpClass;
  item.attributs = obj.attributes;
  item.itemUpdateId = obj.itemUpdateId;
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

Item.prototype.listChildren = function(callback) {
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

  if (!this.container) {
    if (LOG_LIST_CHILDREN) {
      logger.debug("Item.listChildren[" + self + "]  => No container");
    }
    return callback(null, null);
  }

  this._locked = true;

  if (this._childrenIds !== undefined) {
    if (LOG_LIST_CHILDREN) {
      logger.debug("Item.listChildren[" + self + "]  => cache ",
          this._childrenIds.length);
    }

    Async.mapLimit(this._childrenIds, 4, function(id, callback) {
      service.getItemById(id, callback);

    },
        function(error, result) {
          self._locked = undefined;

          if (error) {
            logger.debug(
                "Item.listChildren[" + self + "] => map returs error ", error);
            return callback(error);
          }

          if (LOG_LIST_CHILDREN) {
            logger.debug("Item.listChildren[" + self + "] => map returs " +
                result);
          }

          service._childrenWeakHashmap.put(self, result);

          callback(null, result);
        });
    return;
  }

  if (LOG_LIST_CHILDREN) {
    logger.debug("Item.listChildren[" + self + "] => not in cache !");
  }

  // this._childrenIds = [];
  service.browseItem(this, function(error, list) {
    self._locked = undefined;

    if (error) {
      return callback(error);
    }

    if (LOG_LIST_CHILDREN) {
      logger.debug("Item.listChildren[" + self + "] => ", list);
    }

    service._childrenWeakHashmap.put(self, list);

    return callback(null, list);
  });
};

Item.prototype.getPath = function() {
  return this.path;
};

Item.prototype.getService = function() {
  return this.service;
};

Item.prototype.getParent = function(callback) {
  if (!this.parentId) {
    return callback(null, null);
  }

  var service = this.getService();

  return service.getItemById(this.parentId, callback);
};

Item.prototype.getChildByName = function(name, callback) {
  var self = this;

  this.listChildren(function(error, children) {
    if (error) {
      logger.debug(
          "Item.getChildByName[" + self + "] (" + name + ") => error ", error);
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
      logger.debug("Item.getChildByName[" + self + "] (" + name + ") => find " +
          found);
    }

    return callback(null, found);
  });
};

Item.prototype.addSearchClass = function(searchClass, includeDerived) {
  if (!this.searchClasses) {
    this.searchClasses = [];
  }

  this.searchClasses.push({
    name : searchClass,
    includeDerived : includeDerived
  });
};

Item.prototype.toJXML = function(request, callback) {
  var content = (this.attrs)
      ? this.attrs.slice(0) : [];

  var jxmlItem = {
    _name : "item",
    _attrs : {
      id : this.id,
      parentID : this.parentId,
      restricted : (this.attributes.restricted)
          ? "1" : "0",
      searchable : (this.attributes.searchable)
          ? "1" : "0"
    },
    _content : content
  };

  var scs = this.attributes.searchClasses;
  if (this.attributes.searchable && scs) {
    scs.forEach(function(sc) {
      content.push({
        _name : "upnp:searchClass",
        _attrs : {
          includeDerived : (sc.includeDerived
              ? "1" : "0")
        },
        _content : sc.name
      });
    });
  }

  var title = this.attributes.title;
  content.push({
    _name : "dc:title",
    _content : title || this.name
  });

  if (this.upnpClass) {
    content.push({
      _name : "upnp:class",
      _content : this.upnpClass
    });
  }
  var date = this.attributes.date;
  if (date) {
    content.push({
      _name : "dc:date",
      _content : Item.toISODate(date)
    });
  }

  var resAttrs = this.attributes.resAttrs;
  if (resAttrs) {
    content.push({
      _name : "res",
      _attrs : resAttrs,
      _content : request.contentURL + this.id
    });
  }

  if (!this.container) {
    return callback(null, jxmlItem);
  }

  jxmlItem._name = "container";
  if (this.searchable) {
    jxmlItem._attrs.searchable = true;
  }

  var childrenIds = this._childrenIds; // 

  if (childrenIds) {
    jxmlItem._attrs.childCount = childrenIds.length;
    return callback(null, jxmlItem);
  }

  this.listChildren(function(error, list) {
    if (error) {
      return callback(error);
    }

    jxmlItem._attrs.childCount = (list)
        ? list.length : 0;
    return callback(null, jxmlItem);
  });

  /*
   * content.push({ _name : "upnp:storageUsed", _content : -1 });
   */

};

Item.prototype.setDate = function(date) {
  if (!date) {
    this._date = undefined;
    return;
  }
  this._date = Item.toISODate(date);
};

Item.toISODate = function(date) {
  return date.toISOString().replace(/\..+/, '');
};

Item.prototype.treeString = function(callback) {
  return this._treeString("", callback);
};

Item.prototype._treeString = function(indent, callback) {
  // logger.debug("TreeString " + this);

  indent = indent || "";

  var s = indent + "# " + this + "\n";
  if (!this.container) {
    return callback(null, s);
  }

  indent += "  ";
  if (!this._childrenIds) {
    s += indent + "<Unknown children>\n";
    return callback(null, s);
  }

  var service = this.getService();

  Async.eachSeries(this._childrenIds, function(childId, callback) {
    service.getItemById(childId, function(error, child) {
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

Item.prototype.update = function(callback) {
  logger.debug("Update item itemId=" + this.id + " name=" + this.name);

  // this.getService().updateItem(this, callback);
  callback(null);
};

Item.prototype.garbage = function(callback) {

  var service = this.getService();

  if (!this._childrenIds) {
    if (callback) {
      callback();
    }
    return;
  }

  var self = this;
  Async.each(this._childrenIds, function(child, callback) {
    service.getItemById(child, function(error, item) {
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

Item.prototype._garbageChild = function(callback) {

  var service = this.getService();

  if (!this.container || !this._childrenIds) {
    console.log("Garbage id " + this.id + " " + this.name);
    return service.removeItemById(this.id, callback);
  }

  var self = this;
  Async.each(this._childrenIds, function(child, callback) {
    service.getItemById(child, function(error, item) {
      item._garbageChild(callback);
    });

  }, function(error) {
    if (error) {
      return callback(error);
    }

    self._childrenIds = null;

    console.log("Garbage id " + self.id + " " + self.name);

    return service.removeItemById(self.id, callback);
  });
};

Item.prototype.toString = function() {
  var s = "[Item id=" + this.id + " name='" + this.name + "' class='" +
      this.upnpClass + "'";

  if (this.attributes.virtual) {
    s += " VIRTUAL";
  }

  return s + "]";
};
