/*jslint node: true, plusplus: true, nomen: true, vars: true, node: true */
"use strict";

var assert = require('assert');
var Util = require('util');
var Async = require("async");
var Path = require('path');

var debug = require('debug')('upnpserver:musicRepository');
var logger = require('../logger');

var ScannerRepository = require('./scannerRepository');
var ContentDirectoryService = require('../contentDirectoryService');

var Item = require('../class/object.item');
var MusicGenre = require('../class/object.container.genre.musicGenre');
var MusicArtist = require('../class/object.container.person.musicArtist');
var MusicAlbum = require('../class/object.container.album.musicAlbum');
var MusicTrack = require('../class/object.item.audioItem.musicTrack');

var MusicRepository = function(repositoryId, mountPath, path) {
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

MusicRepository.prototype.processFile = function(rootNode, infos, callback) {
  var contentURL = infos.contentURL;
  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var self = this;

  var attributes = {
    contentURL : contentURL
  };

  var name = Path.basename(contentURL);

  this.contentDirectoryService.createNode(name, MusicTrack.UPNP_CLASS,
      attributes, function(error, node) {
        if (error) {
          return callback(error);
        }

        node.getAttributes(ContentDirectoryService.MED_PRIORITY, function(
            error, attributes) {
          if (error) {
            return callback(error);
          }

          assert(attributes, "Attributes var is null");

          // console.log("Attributes of #" + node.id, attributes);

          var album = attributes.album || i18n.UNKNOWN_ALBUM;
          var title = attributes.title || node.name || i18n.UNKNOWN_TITLE;
          var artists = attributes.artists || [ i18n.UNKNOWN_ARTIST ];
          var genres = attributes.genres || [ i18n.UNKNOWN_GENRE ];
          var albumArtists = attributes.albumArtists;

          var itemData = {
            node : node,
            contentURL : contentURL,
            stats : infos.stats,

            album : album,
            title : title,
            artists : artists,
            genres : genres,
            albumArtists : albumArtists
          };

          self.registerAlbumsFolder(rootNode, itemData, function(error,
              musicTrackItem) {
            if (error) {
              return callback(error);
            }

            // itemData.musicTrackItem = musicTrackItem;

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

              task.fn.call(self, rootNode, itemData, task.param, callback);

            }, function(error) {

              if (error) {
                return callback(error);
              }

              callback();
            });
          });
        });
      });
};

function sync(self, func, args) {
  var parentNode = args[0];
  var ag = Array.prototype.slice.call(args, 0);
  ag[ag.length - 1] = function(error) {
    parentNode._leave("scanner");
    return args[args.length - 1](error);
  };

  parentNode._take("scanner", function() {
    func.apply(self, ag);
  });
}

MusicRepository.prototype.registerArtistsFolder = function(parentNode,
    itemData, artistName, callback) {

  sync(this, this.registerArtistsFolder0, arguments);
};

MusicRepository.prototype.registerArtistsFolder0 = function(parentNode,
    itemData, artistName, callback) {

  var artitsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.ARTISTS_FOLDER;

  var self = this;
  parentNode.getChildByName(artitsLabel, function(error, artistsNode) {

    if (error) {
      return callback(error);
    }

    if (artistsNode) {
      return self.registerArtist(artistsNode, itemData, artistName, callback);
    }

    if (debug.enabled) {
      debug("Register artists folder in #", parentNode.id);
    }

    self.newVirtualContainer(parentNode, artitsLabel, function(error,
        artistsNode) {
      if (error) {
        return callback(error);
      }

      self.registerArtist(artistsNode, itemData, artistName, callback);
    });
  });
};

MusicRepository.prototype.registerArtist = function(parentNode, itemData,
    artistName, callback) {

  sync(this, this.registerArtist0, arguments);
};

MusicRepository.prototype.registerArtist0 = function(parentNode, itemData,
    artistName, callback) {

  var self = this;
  parentNode.getChildByName(artistName, function(error, artistNode) {
    if (error) {
      return callback(error);
    }

    if (artistNode) {
      return self.registerAlbum(artistNode, itemData, callback);
    }

    debug("Register artist on #", parentNode.id, "artist=", artistName);

    self.newVirtualContainer(parentNode, artistName, MusicArtist.UPNP_CLASS,
        null, function(error, artistNode) {
          if (error) {
            return callback(error);
          }

          self.registerAlbum(artistNode, itemData, callback);
        });
  });
};

MusicRepository.prototype.registerAlbum = function(parentNode, itemData,
    genreName, callback) {

  sync(this, this.registerAlbum0, arguments);
};

MusicRepository.prototype.registerAlbum0 = function(parentNode, itemData,
    callback) {

  var album = itemData.album;

  function fillAttributes(albumNode) {
    if (!itemData.albumArtists) {
      return;
    }

    if (!albumNode.attributes.artists) {
      albumNode.attributes.artists = itemData.albumArtists;
      return;
    }

    var aa = albumNode.attributes.artists;
    itemData.albumArtists.forEach(function(artist) {
      if (aa.indexOf(artist) >= 0) {
        return;
      }

      aa.push(artist);
    });
  }

  var self = this;

  parentNode.getChildByName(album, function(error, albumNode) {
    if (error) {
      return callback(error);
    }

    debug("Find album=", album, "in #", parentNode.id, "=>", !!albumNode);

    if (albumNode) {
      if (albumNode.refID) {
        return callback();
      }

      itemData.albumItem = albumNode;

      fillAttributes(albumNode);

      return self.registerMusicTrack(albumNode, itemData, callback);
    }

    if (itemData.albumItem) {
      // Non, pour un artiste on ne veut que les chansons de cet artiste par les autres
      // return self.newNodeRef(parentItem, itemData.albumItem, null, callback);
    }

    debug("New album container parent=#", parentNode.id, "name=", album);

    self.newVirtualContainer(parentNode, itemData.album, MusicAlbum.UPNP_CLASS,
        null, function(error, albumNode) {

          if (error) {
            return callback(error);
          }

          itemData.albumItem = albumNode;

          fillAttributes(albumNode);

          self.registerMusicTrack(albumNode, itemData, callback);
        });
  });
};

MusicRepository.prototype.registerMusicTrack = function(parentNode, itemData,
    callback) {

  sync(this, this.registerMusicTrack0, [ parentNode, itemData, 0, callback ]);
};

MusicRepository.prototype.registerMusicTrack0 = function(parentNode, itemData,
    tryCount, callback) {

  var t = itemData.title;
  if (tryCount) {
    t += "  (#" + (tryCount) + ")";
  }

  var self = this;
  parentNode
      .getChildByTitle(
          t,
          function(error, musicTrackNode) {
            if (error) {
              return callback(error);
            }

            debug("Find musicTrack=", t, "in #", parentNode.id, "=>",
                !!musicTrackNode);

            if (musicTrackNode) {
              musicTrackNode
                  .resolveLink(function(error, mu) {
                    debug("Compare musicTrack contentURL=",
                        mu.attributes.contentURL, "<>", itemData.contentURL,
                        mu.attributes.modifiedTime, "<>", itemData.stats.mtime);

                    if (mu.attributes.contentURL === itemData.contentURL) {
                      if (itemData.stats.mtime.getTime() === mu.attributes.modifiedTime) {

                        debug("Same musicTrack on #", parentNode.id, " title=",
                            t, "node #", mu.id);

                        itemData.musicTrackItem = mu;

                        return callback(null, mu);
                      }
                      
                      parentNode.removeChild(musicTrackNode);
                    }

                    debug("Register musicTrack on #", parentNode.id, " title=",
                        t);

                    self.registerMusicTrack0(parentNode, itemData,
                        tryCount + 1, callback);
                  });
              return;
            }

            if (itemData.musicTrackItem) {
              debug("Link musicTrack on #", parentNode.id, "title=" + t);

              return self.newNodeRef(parentNode, itemData.musicTrackItem, null,
                  callback);
            }

            if (itemData.node) {
              debug("Register musicTrack on #", parentNode.id, " title=", t);

              parentNode.appendChild(itemData.node, function(error) {
                if (error) {
                  return callback(error);
                }

                itemData.musicTrackItem = itemData.node;
                delete itemData.node;

                callback(null, itemData.musicTrackItem);
              });
              return;
            }

            throw new Error("Never happen ! " + Util.inspect(itemData));
          });
};

MusicRepository.prototype.registerGenresFolder = function(parentItem, itemData,
    genreName, callback) {

  return this.registerGenre(parentItem, itemData, genreName, callback);
};

MusicRepository.prototype.registerGenre = function(parentNode, itemData,
    genreName, callback) {

  sync(this, this.registerGenre0, arguments);
};

MusicRepository.prototype.registerGenre0 = function(parentNode, itemData,
    genreName, callback) {

  var self = this;

  parentNode.getChildByName(genreName, function(error, genreItem) {
    if (error) {
      return callback(error);
    }

    if (genreItem) {
      return self.registerAlbum(genreItem, itemData, callback);
    }

    self.newVirtualContainer(parentNode, genreName, MusicGenre.UPNP_CLASS,
        null, function(error, genreItem) {
          if (error) {
            return callback(error);
          }

          self.registerAlbum(genreItem, itemData, callback);
        });
  });
};

MusicRepository.prototype.registerAlbumsFolder = function(parentNode, itemData,
    callback) {

  var self = this;

  parentNode._take("scanner", function() {
    self.registerAlbumsFolder0(parentNode, itemData, function(error) {
      parentNode._leave("scanner");
      return callback(error);
    });
  });
};

MusicRepository.prototype.registerAlbumsFolder0 = function(parentNode,
    itemData, callback) {

  var albumsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.ALBUMS_FOLDER;

  var self = this;

  parentNode.getChildByName(albumsLabel, function(error, albumsNode) {

    if (error) {
      return callback(error);
    }

    if (albumsNode) {
      return self.registerAlbum(albumsNode, itemData, callback);
    }

    debug("Register albums folder in #", parentNode.id);

    self.newVirtualContainer(parentNode, albumsLabel, function(error,
        albumsNode) {
      if (error) {
        return callback(error);
      }

      self.registerAlbum(albumsNode, itemData, callback);
    });
  });
};
