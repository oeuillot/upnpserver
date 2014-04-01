/*jslint node: true, plusplus: true, nomen: true, vars: true */
/*global setImmediate*/
"use strict";

var isoDateFormat = require('./isolocaldateformat').ISOLocalDateFormat;
var Util = require("util");
var Async = require("async");
var logger = require('./logger');

// IT MUST START AT 0 because UPNP ROOT must have id 0
var itemIndex = 0;

var Item = function(parent, name, upnpClass, container, attributes) {

    this.name = name;
    this.upnpClass = upnpClass;
    this.path = (parent) ? (parent.path + ((parent.path !== "/") ? "/" : "") + name)
	    : "/";

    if (container) {
	this.container = true;
    }
    var atts = {};
    this.attributes = atts;
    if (attributes) {
	for (var k in attributes) {
	    atts[k] = attributes[k];
	}
    }
    this.itemUpdateId = 0;

    this.itemId = itemIndex++;

    if (parent) {
	this.parentId = parent.itemId;
	this.service = parent.service;

	if (!parent._childrenIds) {
	    parent._childrenIds = [];
	}

	parent._childrenIds.push(this.itemId);
	parent.itemUpdateId++;
    } else {
	this.parentId = -1;
    }

    logger.debug("NewItem " + this.itemId + " parent=" + this.parentId
	    + " name=" + name + " upnpClass=" + upnpClass + " container="
	    + container);

};

Item.CONTAINER = "object.container";
Item.STORAGE_FOLDER = "object.container.storageFolder";
Item.VIDEO_FILE = "object.item.videoItem";
Item.IMAGE_FILE = "object.item.imageItem";
Item.IMAGE_PHOTO = Item.IMAGE_FILE + ".photo";
Item.AUDIO_FILE = "object.item.audioItem";
Item.MUSIC_TRACK = Item.AUDIO_FILE + ".musicTrack";
Item.MUSIC_ARTIST = "object.container.person.musicArtist";
Item.MUSIC_ALBUM = "object.container.album.musicAlbum";
Item.VIDEO_ALBUM = "object.container.album.videoAlbum";
Item.PHOTO_ALBUM = "object.container.album.photoAlbum";
Item.MUSIC_GENRE = "object.container.genre.musicGenre";
// Playlists should be: object.container.playlistContainer
// object.container.person.movieActor
// object.container.person.musicArtist

module.exports = Item;

Item.prototype.listChildren = function(callback) {
    var self = this;

    if (this._locked) {
	setImmediate(function() {
	    self.listChildren(callback);
	});
	return;
    }

    if (!this.container) {
	logger.debug("Item.listChildren[" + self + "]  => No container");
	return callback(null, null);
    }

    this._locked = true;

    if (this._childrenIds !== undefined) {
	logger.debug("Item.listChildren[" + self + "]  => cache ",
		this._childrenIds.length);

	var upnpServer = this.getService().upnpServer;

	Async.mapLimit(this._childrenIds, 4, function(id, callback) {
	    upnpServer.getItemById(id, callback);

	}, function(error, result) {
	    self._locked = undefined;

	    if (error) {
		logger.debug("Item.listChildren[" + self
			+ "] => map returs error ", error);
		return callback(error);
	    }

	    logger.debug("Item.listChildren[" + self + "] => map returs "
		    + result);

	    callback(null, result);
	});
	return;
    }

    logger.debug("Item.listChildren[" + self + "] => not in cache !");

    // this._childrenIds = [];
    this.getService().browseItem(this, function(error, list) {
	self._locked = undefined;

	if (error) {
	    return callback(error);
	}

	logger.debug("Item.listChildren[" + self + "] => ", list);

	return callback(null, list);
    });
};

Item.prototype.getItemPath = function() {
    return this.path;
};

Item.prototype.getService = function() {
    return this.service;
};

Item.prototype.getParent = function(callback) {
    if (!this.parentId) {
	return callback(null, null);
    }

    var upnpServer = this.getService().upnpServer;

    upnpServer.getItemById(this.parentId, callback);
};

Item.prototype.getChildByName = function(name, callback) {
    var self = this;

    this.listChildren(function(error, children) {
	if (error) {
	    logger.debug("Item.getChildByName[" + self + "] (" + name
		    + ") => error ", error);
	    return callback(error);
	}

	var found = null;
	children.forEach(function(child) {
	    if (child.name === name) {
		found = child;
		return false;
	    }
	});

	logger.debug("Item.getChildByName[" + self + "] (" + name
		+ ") => find " + found);

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

Item.prototype.toJXML = function(request) {
    var content = (this.attrs) ? this.attrs.slice(0) : [];

    var item = {
	_name : "item",
	_attrs : {
	    id : this.itemId,
	    parentID : this.parentId,
	    restricted : (this.attributes.restricted) ? "1" : "0",
	    searchable : (this.attributes.searchable) ? "1" : "0"
	},
	_content : content
    };

    var scs = this.attributes.searchClasses;
    if (this.attributes.searchable && scs) {
	scs.forEach(function(sc) {
	    content.push({
		_name : "upnp:searchClass",
		_attrs : {
		    includeDerived : (sc.includeDerived?"1":"0")
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
	    _content : isoDateFormat.format(date)
	});
    }

    var resAttrs = this.attributes.resAttrs;
    if (resAttrs) {
	content.push({
	    _name : "res",
	    _attrs : resAttrs,
	    _content : request.contentURL + this.itemId
	});
    }

    if (this.container) {
	var childrenIds = this._childrenIds; // 

	item._name = "container";
	if (childrenIds) {
	    item._attrs.childCount = childrenIds.length;
	}
	if (this.searchable) {
	    item._attrs.searchable = true;
	}

	content.push({
	    _name : "upnp:storageUsed",
	    _content : -1
	});
    }

    return item;
};

Item.prototype.setDate = function(date) {
    if (!date) {
	this._date = undefined;
	return;
    }
    this._date = isoDateFormat.format(date);
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

    var upnpServer = this.getService().upnpServer;

    Async.eachSeries(this._childrenIds, function(childId, callback) {
	upnpServer.getItemById(childId, function(error, child) {
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
    logger.debug("Update item itemId=" + this.itemId + " name=" + this.name);

    // this.getService().updateItem(this, callback);
    callback(null);
};

Item.prototype.toString = function() {
    var s = "[Item id=" + this.itemId + " name='" + this.name + "' class='"
	    + this.upnpClass + "'";

    if (this.attributes.virtual) {
	s += " VIRTUAL";
    }

    return s + "]";
};
