var isoDateFormat = require('isolocaldateformat').ISOLocalDateFormat;
var Util = require("util");

var itemIndex = 0;

var Item = function(parent, name, upnpClass, title) {
	this.parent = parent;
	this.name = name;
	this.upnpClass = upnpClass;

	if (title) {
		this.title = title;
	}
	this.itemUpdateId = 0;

	this.itemId = itemIndex++;
	// this.attrs = null;
	// this.searchClasses = null;

	if (parent) {
		if (!parent._children) {
			parent._children = [];
		}

		parent._children.push(this);
		parent.itemUpdateId++;

	}
	if (true) {
		console.log("NewItem " + this.itemId + " parent="
				+ (parent ? parent.itemId : -1) + " name=" + name
				+ " upnpClass=" + upnpClass + " title=" + title);
	}

};

Item.STORAGE_FOLDER = "object.container.storageFolder";
Item.VIDEO_FILE = "object.item.videoItem";
Item.IMAGE_FILE = "object.item.imageItem";
Item.AUDIO_FILE = "object.item.audioItem";
Item.MUSIC_ARTIST = "object.container.person.musicArtist";
Item.MUSIC_ALBUM = "object.container.album.musicAlbum";
Item.MUSIC_GENRE = "object.container.genre.musicGenre";
Item.VIDEO_ALBUM = "object.container.album.videoAlbum";
Item.PHOTO_ALBUM = "object.container.album.photoAlbum";
// Playlists should be: object.container.playlistContainer
// object.container.person.movieActor
// object.container.person.musicArtist

module.exports = Item;

Item.prototype.listChildren = function(callback) {
	if (this._children !== undefined) {
		console.log("Item.listChildren => cache ", this._children);

		return callback(null, this._children);
	}

	this._children = [];
	var self=this;
	this.getService().browseItem(this, function(error, list) {
		if (error) {
			return callback(error);
		}

		// console.log("Item.listChildren => ", self._children);
		return callback(null, self._children);
	});
};

Item.prototype.getItemPath = function() {
	var segments = [];
	var item = this;
	for (; item && !item.service; item = item.parent) {
		segments.unshift(item.name);
	}

	var path = "/" + segments.join("/");

	return path;
};

Item.prototype.getService = function() {
	var item = this;
	for (; item; item = item.parent) {
		if (item.service) {
			return item.service;
		}
	}

	throw new Error("Can not find root node as service !");
};

Item.prototype.getChildByName = function(name, callback) {
	this.listChildren(function(error, children) {
		if (error) {
			console.log("Item.getChildByName(" + name + ") => error ", error);
			return callback(error);
		}

		var found = null;
		children.forEach(function(child) {
			if (child.name == name) {
				found = child;
				return false;
			}
		});

		console.log("Item.getChildByName(" + name + ") => find ", found);
		return callback(null, found);
	});
};

Item.prototype.addSearchClass = function(searchClass, includeDerived) {
	if (!this.searchClasses) {
		this.searchClasses = [];
	}

	this.searchClasses.push({
		searchClass : searchClass,
		includeDerived : includeDerived
	});
};

Item.prototype.addAttribute = function(attribute) {
	if (!this.attrs) {
		this.attrs = [];
	}

	this.attrs.push(attribute);
};

Item.prototype.toJXML = function(request) {
	var content = (this.attrs) ? this.attrs.slice(0) : [];

	var item = {
		_name : "item",
		_attrs : {
			id : this.itemId,
			parentID : (this.parent) ? this.parent.itemId : -1,
			restricted : (this.restricted !== undefined) ? this.restricted : 1
		},
		_content : content
	};

	if (this.upnpClass == Item.STORAGE_FOLDER) {
		var children = this._children; // On va dire que c'est forcement
		// remplit !

		item._name = "container";
		item._attrs.childCount = (children) ? children.length : 0;
		item._attrs.searchable = true;
	}

	content.push({
		_name : "dc:title",
		_content : this.title || this.name
	});

	if (this.upnpClass) {
		content.push({
			_name : "upnp:class",
			_content : this.upnpClass
		});
	}
	var date = this._date;
	if (date) {
		content.push({
			_name : "dc:date",
			_content : date
		});
	}
	var scs = this.searchClasses;
	if (scs) {
		scs.forEach(function(sc) {
			content.push({
				_name : "upnp:searchClass",
				_attrs : {
					includeDerived : !!sc.includeDerived
				},
				_content : searchClass
			});
		});
	}

	var resAttrs = this.resAttrs;
	if (resAttrs) {
		content.push({
			_name : "res",
			_attrs : resAttrs,
			_content : request.contentURL + this.itemId
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
