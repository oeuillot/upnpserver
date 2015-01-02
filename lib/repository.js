/*jslint node: true, plusplus:true */
"use strict";

var assert = require('assert');
var Mime = require('mime');
var Path = require('path');
var fs = require('fs');
var send = require('send');

var Item = require('./item');

var VIRTUAL_CONTAINER = {
  virtual : true
};

var Repository = function(repositoryId, mountPath, searchClasses) {
  this.repositoryId = repositoryId;

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
    attributes.date = stats.mtime;

    if (!stats.mime) {
      var mime = Mime.lookup(Path.extname(path).substring(1), "");
      stats.mime = mime;
    }

    if (!upnpClass) {
      var mime = stats.mime.split("/");

      switch (mime[0]) {
      case "video":
        upnpClass = Item.VIDEO_FILE;
        break;

      case "audio":
        upnpClass = Item.MUSIC_TRACK;
        break;

      case "image":
        upnpClass = Item.IMAGE_FILE;
        break;
      }
    }

    if (!upnpClass) {
      return callback({
        code : Repository.UPNP_CLASS_UNKNOWN
      });
    }

    return self.contentDirectoryService.newFile(parent, path, upnpClass, stats,
        attributes, self.repositoryId, callback);
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
    upnpClass = Item.STORAGE_FOLDER;
  }

  var name = Path.basename(path);

  attributes = attributes || {};
  attributes.realpath = path;

  var self = this;
  function processStats(stats) {
    attributes.date = stats.mtime;

    return self.contentDirectoryService.newContainer(parent, name, upnpClass,
        attributes, self.repositoryId, callback);
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

  if (!upnpClass) {
    upnpClass = Item.CONTAINER;
  }
  if (!attributes) {
    attributes = VIRTUAL_CONTAINER;
  } else {
    attributes.virtual = true;
  }
  // (parent, name, upnpClass, virtual, attributes, repositoryId, callback
  return this.contentDirectoryService.newContainer(parent, path, upnpClass,
      attributes, this.repositoryId, callback);
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

Repository.prototype.processResponse = function(item, request, response, path,
    parameters, callback) {

  var realpath = item.attributes.realPath;

  if (!realpath) {
    response.writeHead(404, 'Resource not found: ' + item.id);
    response.end();
    return callback(null, true);
  }

  send(request, realpath).pipe(response);

  return callback(null, true);
};
