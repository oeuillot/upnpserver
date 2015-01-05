/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Util = require('util');
var Async = require("async");
var _ = require('underscore');

var Item = require('./node');
var logger = require('./logger');
var ScannerRepository = require('./scannerRepository');
var Repository = require('./repository');
var id3Parser = require('./id3Parser');

var FILES_PROCESSOR_LIMIT = 4;

var MusicRepository = function(repositoryId, mountPath, path, searchClasses) {
  ScannerRepository.call(this, repositoryId, mountPath, path);
};

Util.inherits(MusicRepository, ScannerRepository);

module.exports = MusicRepository;

MusicRepository.prototype.keepFile = function(infos) {
  var mime = infos.mime;
  var mimePart = mime.split("/");

  if (mimePart.length !== 2 || mimePart[0] !== "audio") {
    return false;
  }

  if (mimePart[1] === "x-mpegurl") {
    return false; // Dont keep .m3u
  }

  return true;
};

MusicRepository.prototype.processFile = function(rootItem, infos, callback) {
  var path = infos.path;
  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var self = this;

  id3Parser.parse({}, path, function(error, tags) {

    if (!tags) {
      logger.error("No id3 tags for path=", path);
      return callback(null);
    }
    // logger.debug("Tags=",tags.getTags());

    var album = tags.album || i18n.UNKNOWN_ARTIST;
    var title = tags.title || i18n.UNKNOWN_TITLE;
    var artists = tags.artists || [ i18n.UNKNOWN_ARTIST ];
    var genres = tags.genres || [ i18n.UNKNOWN_GENRE ];

    var tasks = [];

    if (artists) {
      artists.forEach(function(artist) {
        if (!artist) {
          // artist = i18n.UNKNOWN_ARTIST;
          return;
        }
        artist = artist.trim();
        tasks.push({
          fn : self.registerArtistFolder,
          param : artist
        });
      });
    }

    if (genres) {
      genres.forEach(function(genre) {
        if (!genre) {
          // genre = i18n.UNKNOWN_GENRE;
          return;
        }
        genre = genre.trim();
        tasks.push({
          fn : self.registerGenreFolder,
          param : genre
        });
      });
    }

    Async.eachLimit(tasks, FILES_PROCESSOR_LIMIT, function(task, callback) {
      // logger.debug("Task: ", task.fn, task.param);

      task.fn.call(self, rootItem, path, task.param, album, title, tags,
          callback);

    }, function(error) {
      if (error) {
        return callback(error);
      }

      callback();
    });
  });
};

MusicRepository.prototype.registerArtistFolder = function(rootItem, path,
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
      return self.newVirtualContainer(rootItem, artitsLabel, null, null,
          function(error, item) {
            if (error) {
              return callback(error);
            }

            self.registerArtist(item, path, artist, album, title, tags,
                callback);
          });
    }

    self.registerArtist(item, path, artist, album, title, tags, callback);
  });
};

MusicRepository.prototype.registerArtist = function(rootItem, path, artist,
    album, title, tags, callback) {

  logger.debug("Register artist on " + rootItem.id + " path=" + path +
      " artist=" + artist + " album=" + album);

  var self = this;
  rootItem.getChildByName(artist, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.newMusicArtistContainer(rootItem, artist, null, function(
          error, item) {
        if (error) {
          return callback(error);
        }

        self.registerAlbum(item, path, album, title, tags, callback);
      });
    }

    self.registerAlbum(item, path, album, title, tags, callback);
  });
};

MusicRepository.prototype.registerAlbum = function(rootItem, path, album,
    title, tags, callback) {

  logger.debug("Register album  parent=" + rootItem.id + " path=" + path +
      " album=" + album + " title=" + title);

  var self = this;
  rootItem.getChildByName(album, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.newMusicAlbumContainer(rootItem, album, null, function(error,
          item) {

        if (error) {
          return callback(error);
        }

        self.registerTitle(item, path, title, tags, 0, callback);
      });
    }

    self.registerTitle(item, path, title, tags, 0, callback);
  });
};

MusicRepository.prototype.registerTitle = function(rootItem, path, title, tags,
    tryCount, callback) {

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

    if (item) {
      if (item.attributes.realPath === path) {
        return callback(null, item);
      }

      return self.registerTitle(rootItem, path, title, tags, tryCount + 1,
          callback);
    }

    var attributes = {
      title : t,
      virtual : true,
    };

    var configuration = self.contentDirectoryService.upnpServer.configuration;

    if (!configuration.disableMusicMetadata) {
      attributes.id3 = true;

      _.extend(attributes, tags);
    }
    // console.log("Tags=", tags, " => ", attributes);

    return self.newMusicTrack(rootItem, path, null, attributes, callback);
  });
};

MusicRepository.prototype.registerGenreFolder = function(rootItem, path, genre,
    album, title, tags, callback) {

  return this
      .registerGenre(rootItem, path, genre, album, title, tags, callback);
};

MusicRepository.prototype.registerGenre = function(rootItem, path, genre,
    album, title, tags, callback) {

  var self = this;
  rootItem.getChildByName(genre, function(error, item) {
    if (error) {
      return callback(error);
    }

    if (!item) {
      return self.newMusicGenreContainer(rootItem, genre, null, function(error,
          item) {
        if (error) {
          return callback(error);
        }

        self.registerAlbum(item, path, album, title, tags, callback);
      });
    }

    self.registerAlbum(item, path, album, title, tags, callback);
  });
};
