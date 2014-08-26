/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var ScannerRepository = require('./scannerRepository');
var Util = require('util');
var async = require('async');
var fs = require('fs');
var Path = require('path');
var Mime = require('mime');
var Item = require('./item');
var id3 = require('id3js');
var Async = require("async");
var Buffer = require("buffer").Buffer;
var logger = require('./logger');

// var stackTrace = require('stack-trace');

var FILES_PROCESSOR_LIMIT = 4;

var VIRTUAL_CONTAINER = {
  virtual : true
};

var MusicRepository = function(repositoryId, mountPath, path, searchClasses) {
  ScannerRepository.call(this, repositoryId, mountPath, path);
};

Util.inherits(MusicRepository, ScannerRepository);

module.exports = MusicRepository;

MusicRepository.prototype.keepFile = function(infos) {
  var mime = Mime.lookup(Path.basename(infos.path));
  var mime0 = mime.split("/")[0];

  if (mime0 !== "audio") {
    return false;
  }

  infos.mime = mime;

  return true;
};

MusicRepository.prototype.processFile = function(rootItem, infos, callback) {

  // logger.debug("Process file", infos.path, " depth=" + stackTrace.get().length);

  var self = this;
  id3({
    file : infos.path,
    type : id3.OPEN_LOCAL

  }, function(error, tags) {
    if (error) {
      logger.error("Can not read path=", infos.path, " error=", error);
      return callback(null);
    }

    self._construct(rootItem, infos.path, tags, callback);
  });
};

MusicRepository.prototype._construct = function(rootItem, path, tags, callback) {
  if (!tags) {
    logger.error("No id3 tags for path=", path);
    return callback(null);
  }
  // logger.debug("Tags=",tags.getTags());

  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var album = tags.album || i18n.UNKNOWN_ARTIST;
  var title = tags.title || i18n.UNKNOWN_TITLE;
  var artist = tags.artist || i18n.UNKNOWN_ARTIST;
  var genre = tags.genre || i18n.UNKNOWN_GENRE;

  var tasks = [];

  if (artist) {
    tasks.push({
      fn : this._registerArtistFolder,
      param : artist
    });
  }

  if (genre) {
    tasks.push({
      fn : this._registerGenreFolder,
      param : genre
    });
  }

  var self = this;
  Async.eachLimit(tasks, FILES_PROCESSOR_LIMIT, function(task, callback) {
    // logger.debug("Task: ", task.fn, task.param);

    task.fn
        .call(self, rootItem, path, task.param, album, title, tags, callback);

  }, function(error) {
    if (error) {
      return callback(error);
    }

    callback();
  });
};

MusicRepository.prototype._registerArtistFolder = function(rootItem, path,
    artist, album, title, tags, callback) {

  logger.debug("Register artist folder on " + rootItem.id + " path=" + path +
      " artist=" + artist + " album=" + album);

  var self = this;

  var artitsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.ARTISTS_FOLDER;

  rootItem.getChildByName(artitsLabel, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.contentDirectoryService.newContainer(rootItem, artitsLabel,
          Item.CONTAINER, true, VIRTUAL_CONTAINER, function(error, item) {
            if (error) {
              return callback(error);
            }

            self._registerArtist(item, path, artist, album, title, tags,
                callback);
          });
    }

    self._registerArtist(item, path, artist, album, title, tags, callback);
  });
};

MusicRepository.prototype._registerArtist = function(rootItem, path, artist,
    album, title, tags, callback) {

  logger.debug("Register artist on " + rootItem.id + " path=" + path +
      " artist=" + artist + " album=" + album);

  var self = this;
  rootItem.getChildByName(artist, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.contentDirectoryService.newContainer(rootItem, artist,
          Item.MUSIC_ARTIST, true, VIRTUAL_CONTAINER, function(error, item) {
            if (error) {
              return callback(error);
            }

            self._registerAlbum(item, path, album, title, tags, callback);
          });
    }

    self._registerAlbum(item, path, album, title, tags, callback);
  });
};

MusicRepository.prototype._registerAlbum = function(rootItem, path, album,
    title, tags, callback) {

  logger.debug("Register album  parent=" + rootItem.id + " path=" + path +
      " album=" + album + " title=" + title);

  var self = this;
  rootItem.getChildByName(album, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.contentDirectoryService.newContainer(rootItem, album,
          Item.MUSIC_ALBUM, true, VIRTUAL_CONTAINER, function(error, item) {

            if (error) {
              return callback(error);
            }

            self._registerTitle(item, path, title, tags, 0, callback);
          });
    }

    self._registerTitle(item, path, title, tags, 0, callback);
  });
};

MusicRepository.prototype._registerTitle = function(rootItem, path, title,
    tags, tryCount, callback) {

  var t = title;
  if (tryCount) {
    t = title + "  (#" + (tryCount) + ")";
  }

  logger.debug("Register title on " + rootItem.id + " path=" + path +
      " title=" + title + " count=" + tryCount);

  var self = this;
  rootItem.getChildByName(t, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (item && item.attributes.realPath === path) {
      return callback(null, item);
    }

    if (!item) {
      return self.contentDirectoryService.newFile(rootItem, path,
          Item.MUSIC_TRACK, false, {
            title : t,
            virtual : true
          // id3tags : tags // memoryLeak
          }, callback);
    }

    return self._registerTitle(rootItem, path, title, tags, tryCount + 1,
        callback);
  });
};

MusicRepository.prototype._registerGenreFolder = function(rootItem, path,
    genre, album, title, tags, callback) {

  return this._registerGenre(rootItem, path, genre, album, title, tags,
      callback);
};

MusicRepository.prototype._registerGenre = function(rootItem, path, genre,
    album, title, tags, callback) {

  var self = this;
  rootItem.getChildByName(genre, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.contentDirectoryService.newContainer(rootItem, genre,
          Item.MUSIC_GENRE, true, VIRTUAL_CONTAINER, function(error, item) {
            if (error) {
              return callback(error);
            }

            self._registerAlbum(item, path, album, title, tags, callback);
          });
    }

    self._registerAlbum(item, path, album, title, tags, callback);
  });
};
