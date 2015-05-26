/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Util = require('util');
var Async = require("async");
var Path = require('path');

var debug = require('debug')('upnpserver:musicRepository');
var logger = require('../logger');

var ScannerRepository = require('./scannerRepository');

var Item = require('../class/object.item');
var MusicGenre = require('../class/object.container.genre.musicGenre');
var MusicArtist = require('../class/object.container.person.musicArtist');
var MusicAlbum = require('../class/object.container.album.musicAlbum');
var MusicTrack = require('../class/object.item.audioItem.musicTrack');

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
  var path = infos.contentURL;
  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var self = this;

  var attributes = {
    contentURL : path
  };

  this.contentDirectoryService.createNode(Path.basename(path),
      MusicTrack.UPNP_CLASS, attributes, function(error, node) {
        if (error) {
          return callback(error);
        }

        var attributes = node.attributes;

        // console.log("Attributes of #" + node.id, attributes);

        var album = attributes.album || i18n.UNKNOWN_ALBUM;
        var title = attributes.title || node.name || i18n.UNKNOWN_TITLE;
        var artists = attributes.artists || [ i18n.UNKNOWN_ARTIST ];
        var genres = attributes.genres || [ i18n.UNKNOWN_GENRE ];

        var itemData = {
          node : node,
          path : path,

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

          Async.eachSeries(tasks, function(task, callback) {
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

    if (debug.enabled) {
      debug("Register artists folder in " + parentItem.id);
    }

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

    if (debug.enabled) {
      debug("Register artist on " + parentItem.id + " artist=" + artistName);
    }

    self.newVirtualContainer(parentItem, artistName, MusicArtist.UPNP_CLASS,
        null, function(error, artistItem) {
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
  parentItem.getChildByName(album, function(error, albumItem) {
    if (error) {
      return callback(error);
    }

    if (debug.enabled) {
      debug("Find '" + album + "' in #" + parentItem.id + " => " + albumItem);
    }

    if (albumItem) {
      if (albumItem.refID) {
        return callback();
      }

      itemData.albumItem = albumItem;

      return self.registerMusicTrack(albumItem, itemData, 0, callback);
    }

    if (itemData.albumItem) {
      return self.newItemRef(parentItem, itemData.albumItem, null, callback);
    }

    if (debug.enabled) {
      debug("New album container parent=#" + parentItem.id + " album name='" +
          album + "'");
    }

    self.newVirtualContainer(parentItem, itemData.album, MusicAlbum.UPNP_CLASS,
        null, function(error, albumItem) {

          if (error) {
            return callback(error);
          }

          itemData.albumItem = albumItem;

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

    if (debug.enabled) {
      debug("Find '" + t + "' in #" + parentItem.id + " => " + musicTrackItem);
    }

    if (musicTrackItem) {
      musicTrackItem.resolveLink(function(error, mu) {
        if (mu.attributes.contentURL === itemData.contentURL) {
          itemData.musicTrackItem = mu;

          return callback(null, mu);
        }

        if (debug.enabled) {
          debug("Register title on " + parentItem.id + " title=" + t);
        }

        self.registerMusicTrack(parentItem, itemData, tryCount + 1, callback);
      });
      return;
    }

    if (itemData.musicTrackItem) {
      if (debug.enabled) {
        debug("Link title on " + parentItem.id + " title=" + t);
      }

      return self.newItemRef(parentItem, itemData.musicTrackItem, null,
          callback);
    }

    if (itemData.node) {
      parentItem.appendChild(itemData.node, function(error) {
        if (error) {
          return callback(error);
        }

        itemData.musicTrackItem = itemData.node;
        itemData.node = null;

        callback();
      });
      return;
    }

    throw new Error("Never happen !");
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

    self.newVirtualContainer(parentItem, genreName, MusicGenre.UPNP_CLASS,
        null, function(error, genreItem) {
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

    if (debug.enabled) {
      debug("Register albums folder in " + parentItem.id);
    }

    self.newVirtualContainer(parentItem, albumsLabel, null, null, function(
        error, albumsItem) {
      if (error) {
        return callback(error);
      }

      self.registerAlbum(albumsItem, itemData, callback);
    });
  });
};
