/*jslint node: true, plusplus:true */
"use strict";

var assert = require('assert');
var Mime = require('mime');
var Path = require('path');
var fs = require('fs');
var Uuid = require('node-uuid');

var Item = require('./class/object.item');

var VIRTUAL_CONTAINER = {
  virtual : true
};

var Repository = function(repositoryId, mountPath, searchClasses) {
  this.repositoryId = repositoryId || Uuid.v4();

  if (!mountPath) {
    mountPath = "";
  }
  if (mountPath.charAt(0) !== '/') {
    mountPath = "/" + mountPath;
  }
  this.mountPath = mountPath;

};

Repository.UPNP_CLASS_UNKNOWN = "UpnpClassUnknown";

module.exports = Repository;

Repository.prototype.initialize = function(service, callback) {
  this.contentDirectoryService = service;

  service.allocateItemsForPath(this.mountPath, callback);
};

Repository.prototype.browse = function(list, item, callback) {
  return callback(null);
};

Repository.prototype.update = function(item, callback) {
  return callback(null);
};

function computeDate(t) {
  if (t.getFullYear() >= 1970) {
    return t.getTime();
  }

  return t;
}

Repository.prototype.newFile = function(parent, path, upnpClass, stats,
    attributes, callback) {

  if (typeof (callback) !== "function") {
    throw new Error("Invalid callback parameter");
  }

  if (!attributes) {
    attributes = {};
  }

  var self = this;
  function processStats(stats) {
    if (!attributes.date && stats.mtime) {
      attributes.date = computeDate(stats.mtime);
    }
    if (!attributes.mime) {
      attributes.mime = stats.mime;
    }

    if (!upnpClass) {
      if (attributes.mime === undefined) {
        var mime = Mime.lookup(path, "");
        attributes.mime = mime;
      }

      var mimeParts = attributes.mime.split("/");

      switch (mimeParts[0]) {
      case "video":
        upnpClass = Item.VIDEO_ITEM;
        break;

      case "audio":
        upnpClass = Item.MUSIC_TRACK;
        break;

      case "image":
        // upnpClass = Item.IMAGE_ITEM;
        break;
      }
    }

    if (!upnpClass) {
      return callback({
        code : Repository.UPNP_CLASS_UNKNOWN
      });
    }

    return self.contentDirectoryService.newFile(parent, path, upnpClass, stats,
        attributes, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  fs.stat(path, function(error, stats) {
    if (error) {
      return callback(error);
    }

    return processStats(stats);
  });
};

Repository.prototype.newFolder = function(parent, path, upnpClass, stats,
    attributes, callback) {

  assert(typeof (callback) === "function", "Invalid callback parameter");

  if (!upnpClass) {
    upnpClass = Item.CONTAINER;
  }

  var name = Path.basename(path);

  attributes = attributes || {};
  attributes.realpath = path;

  var self = this;
  function processStats(stats) {
    attributes.date = stats.mtime;

    return self.contentDirectoryService.newContainer(parent, name, upnpClass,
        attributes, callback);
  }

  if (stats) {
    return processStats(stats);
  }

  fs.stat(path, function(error, stats) {
    if (error) {
      return callback(error);
    }

    return processStats(stats);
  });
};

Repository.prototype.newPhoto = function(parent, path, stats, attributes,
    callback) {
  return this.newFile(parent, path, Item.PHOTO_FILE, stats, attributes,
      callback);
};

Repository.prototype.newVideo = function(parent, path, stats, attributes,
    callback) {
  return this.newFile(parent, path, Item.VIDEO_FILE, stats, attributes,
      callback);
};

Repository.prototype.newAudio = function(parent, path, stats, attributes,
    callback) {
  return this.newFile(parent, path, Item.AUDIO_FILE, stats, attributes,
      callback);
};

Repository.prototype.newMusicTrack = function(parent, path, stats, attributes,
    callback) {
  return this.newFile(parent, path, Item.MUSIC_TRACK, stats, attributes,
      callback);
};

Repository.prototype.newVirtualContainer = function(parent, path, upnpClass,
    attributes, callback) {

  assert(typeof (callback) === "function", "Invalid callback parameter");

  if (!attributes) {
    attributes = {};
  }

  if (!upnpClass) {
    upnpClass = Item.CONTAINER;
  }

  attributes.virtual = true;

  // (parent, name, upnpClass, virtual, attributes, callback
  return this.contentDirectoryService.newContainer(parent, path, upnpClass,
      attributes, callback);
};

Repository.prototype.newMusicGenreContainer = function(parent, name,
    attributes, callback) {
  return this.newVirtualContainer(parent, name, Item.MUSIC_GENRE, attributes,
      callback);
};

Repository.prototype.newMusicArtistContainer = function(parent, name,
    attributes, callback) {
  return this.newVirtualContainer(parent, name, Item.MUSIC_ARTIST, attributes,
      callback);
};

Repository.prototype.newMusicAlbumContainer = function(parent, name,
    attributes, callback) {
  return this.newVirtualContainer(parent, name, Item.MUSIC_ALBUM, attributes,
      callback);
};

Repository.prototype.newItemRef = function(parent, targetItem, name, callback) {

  return this.contentDirectoryService.newItemRef(parent, targetItem, name,
      callback);
};
