/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var SHARE_ALBUM_ID = false;

var Util = require('util');
var Async = require("async");
var _ = require('underscore');

var Item = require('../node');
var logger = require('../logger');
var ScannerRepository = require('./scannerRepository');
var id3Parser = require('../id3Parser');

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

    var album = tags.album || i18n.UNKNOWN_ALBUM;
    var title = tags.title || i18n.UNKNOWN_TITLE;
    var artists = tags.artists || [ i18n.UNKNOWN_ARTIST ];
    var genres = tags.genres || [ i18n.UNKNOWN_GENRE ];

    var itemData = {
      path : path,
      tags : tags,
      stats : infos.stats,

      album : album,
      title : title,
      artists : artists,
      genres : genres
    };

    self.registerAlbumsFolder(rootItem, itemData, function(error,
        musicTrackItem) {
      if (error) {
        return callback(error);
      }

      itemData.musicTrackItem = musicTrackItem;

      var tasks = [];

      if (artists) {
        artists.forEach(function(artist) {
          if (!artist) {
            // artist = i18n.UNKNOWN_ARTIST;
            return;
          }
          artist = artist.trim();
          tasks.push({
            fn : self.registerArtistsFolder,
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
            fn : self.registerGenresFolder,
            param : genre
          });
        });
      }

      Async.eachLimit(tasks, FILES_PROCESSOR_LIMIT, function(task, callback) {
        // logger.debug("Task: ", task.fn, task.param);

        task.fn.call(self, rootItem, itemData, task.param, callback);

      }, function(error) {
        if (error) {
          return callback(error);
        }

        callback();
      });
    });

  });

};

MusicRepository.prototype.registerArtistsFolder = function(parentItem,
    itemData, artistName, callback) {

  var artitsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.ARTISTS_FOLDER;

  var self = this;
  parentItem.getChildByName(artitsLabel, function(error, artistsItem) {

    if (error) {
      return callback(error);
    }

    if (artistsItem) {
      return self.registerArtist(artistsItem, itemData, artistName, callback);
    }

    logger.debug("Register artists folder in " + parentItem.id);

    self.newVirtualContainer(parentItem, artitsLabel, null, null, function(
        error, artistsItem) {
      if (error) {
        return callback(error);
      }

      self.registerArtist(artistsItem, itemData, artistName, callback);
    });
  });
};

MusicRepository.prototype.registerArtist = function(parentItem, itemData,
    artistName, callback) {

  var self = this;
  parentItem.getChildByName(artistName, function(error, artistItem) {
    if (error) {
      return callback(error);
    }

    if (artistItem) {
      return self.registerAlbum(artistItem, itemData, callback);
    }

    logger.debug("Register artist on " + parentItem.id + " artist=" +
        artistName);

    self.newMusicArtistContainer(parentItem, artistName, null, function(error,
        artistItem) {
      if (error) {
        return callback(error);
      }

      self.registerAlbum(artistItem, itemData, callback);
    });
  });
};

MusicRepository.prototype.registerAlbum = function(parentItem, itemData,
    callback) {

  var album = itemData.album;

  var self = this;
  parentItem.getChildByName(album,
      function(error, albumItem) {
        if (error) {
          return callback(error);
        }

        if (albumItem) {
          if (albumItem.refID) {
            return callback(null, albumItem);
          }

          if (SHARE_ALBUM_ID) {
            itemData.albumItem = albumItem;
          }
          return self.registerMusicTrack(albumItem, itemData, 0, callback);
        }

        if (itemData.albumItem) {
          return self.newItemRef(parentItem, itemData.albumItem, album,
              callback);
        }

        logger.debug("Register album  parent=" + parentItem.id + " album=" +
            album);

        self.newMusicAlbumContainer(parentItem, itemData.album, null, function(
            error, albumItem) {

          if (error) {
            return callback(error);
          }

          if (SHARE_ALBUM_ID) {
            itemData.albumItem = albumItem;
          }

          self.registerMusicTrack(albumItem, itemData, 0, callback);
        });
      });
};

MusicRepository.prototype.registerMusicTrack = function(parentItem, itemData,
    tryCount, callback) {

  var t = itemData.title;
  if (tryCount) {
    t += "  (#" + (tryCount) + ")";
  }

  var self = this;
  parentItem.getChildByName(t, function(error, musicTrackItem) {
    if (error) {
      return callback(error);
    }

    if (musicTrackItem) {
      if (musicTrackItem.attributes.realPath === itemData.path) {
        return callback(null, musicTrackItem);
      }

      logger.debug("Register title on " + parentItem.id + " title=" + t);

      return self.registerMusicTrack(parentItem, itemData, tryCount + 1,
          callback);
    }

    if (itemData.musicTrackItem) {
      return self.newItemRef(parentItem, itemData.musicTrackItem, null,
          callback);
    }

    var attributes = {
      title : itemData.title
    // virtual : true
    };

    var configuration = self.contentDirectoryService.upnpServer.configuration;

    if (!configuration.disableMusicMetadata) {
      attributes.id3 = true;

      _.extend(attributes, itemData.tags);
    }

    logger.debug("Register title on " + parentItem.id + " title=" + t);

    return self.newMusicTrack(parentItem, itemData.path, itemData.stats,
        attributes, callback);
  });
};

MusicRepository.prototype.registerGenresFolder = function(parentItem, itemData,
    genreName, callback) {

  return this.registerGenre(parentItem, itemData, genreName, callback);
};

MusicRepository.prototype.registerGenre = function(parentItem, itemData,
    genreName, callback) {

  var self = this;
  parentItem.getChildByName(genreName, function(error, genreItem) {
    if (error) {
      return callback(error);
    }

    if (genreItem) {
      return self.registerAlbum(genreItem, itemData, callback);
    }

    self.newMusicGenreContainer(parentItem, genreName, null, function(error,
        genreItem) {
      if (error) {
        return callback(error);
      }

      self.registerAlbum(genreItem, itemData, callback);
    });
  });
};

MusicRepository.prototype.registerAlbumsFolder = function(parentItem, itemData,
    callback) {

  var albumsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.ALBUMS_FOLDER;

  var self = this;
  parentItem.getChildByName(albumsLabel, function(error, albumsItem) {

    if (error) {
      return callback(error);
    }

    if (albumsItem) {
      return self.registerAlbum(albumsItem, itemData, callback);
    }

    logger.debug("Register albums folder in " + parentItem.id);

    self.newVirtualContainer(parentItem, albumsLabel, null, null, function(
        error, albumsItem) {
      if (error) {
        return callback(error);
      }

      self.registerAlbum(albumsItem, itemData, callback);
    });
  });
};
