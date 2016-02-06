/*jslint node: true, nomen: true, node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Util = require('util');
const Async = require("async");
const Path = require('path');

const debug = require('debug')('upnpserver:repositories:Music');
const logger = require('../logger');

const ScannerRepository = require('./scanner');
const ContentDirectoryService = require('../contentDirectoryService');

const Item = require('../class/object.item');
const MusicGenre = require('../class/object.container.genre.musicGenre');
const MusicArtist = require('../class/object.container.person.musicArtist');
const MusicAlbum = require('../class/object.container.album.musicAlbum');
const MusicTrack = require('../class/object.item.audioItem.musicTrack');

class MusicRepository extends ScannerRepository {


  get type() {
    return "music";
  }

  /**
   * 
   */
  keepFile(infos) {
    var mimeType = infos.mimeType;
    var mimePart = mimeType.split("/");

    if (mimePart.length !== 2 || mimePart[0] !== "audio") {
      return false;
    }

    if (mimePart[1] === "x-mpegurl") {
      return false; // Dont keep .m3u
    }

    return true;
  }

  /**
   * 
   */
  processFile(rootNode, infos, callback) {
    assert.equal(typeof (callback), "function", "Invalid callback parameter");

    var contentURL = infos.contentURL;

    this.service.loadMetas(infos, (error, attributes) => {
      if (error) {
        return callback(error);
      }

      assert(attributes, "Attributes var is null");

      // console.log("Attributes of #" + node.id, attributes);

      var name = Path.basename(contentURL);

      var i18n = this.service.upnpServer.configuration.i18n;

      var album = attributes.album || i18n.UNKNOWN_ALBUM;
      var title = attributes.title || name || i18n.UNKNOWN_TITLE;
      var artists = attributes.artists || [ i18n.UNKNOWN_ARTIST ];
      var genres = attributes.genres || [ i18n.UNKNOWN_GENRE ];
      var albumArtists = attributes.albumArtists;

      var itemData = {
          contentURL : contentURL,
          attributes: attributes,
          stats : infos.stats,

          album : album,
          title : title,
          artists : artists,
          genres : genres,
          albumArtists : albumArtists
      };

      this.registerAlbumsFolder(rootNode, itemData, (error, musicTrackNode) => {
        if (error) {
          return callback(error);
        }

        // itemData.musicTrackNode = musicTrackNode;

        var tasks = [];

        if (artists) {
          artists.forEach((artist) => {
            if (!artist) {
              // artist = i18n.UNKNOWN_ARTIST;
              return;
            }
            artist = artist.trim();
            tasks.push({
              fn : this.registerArtistsFolder,
              param : artist
            });
          });
        }

        if (genres) {
          genres.forEach((genre) => {
            if (!genre) {
              // genre = i18n.UNKNOWN_GENRE;
              return;
            }
            genre = genre.trim();
            tasks.push({
              fn : this.registerGenresFolder,
              param : genre
            });
          });
        }

        Async.eachSeries(tasks, (task, callback) => {
          // logger.debug("Task: ", task.fn, task.param);

          task.fn.call(this, rootNode, itemData, task.param, callback);

        }, (error) => {
          if (error) {
            return callback(error);
          }

          callback();
        });
      });
    });    
  }

  /**
   * 
   */
  registerArtistsFolder(parentNode, itemData, artistName, callback) {
    assert.equal(typeof (callback), "function", "Invalid callback parameter");

    parentNode.takeLock("scanner", () => {
  
      var artitsLabel = this.service.upnpServer.configuration.i18n.ARTISTS_FOLDER;
  
      parentNode.getFirstVirtualChildByTitle(artitsLabel, (error, artistsNode) => {
  
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        if (artistsNode) {
          parentNode.leaveLock("scanner");

          return this.registerArtist(artistsNode, itemData, artistName, callback);
        }
  
        debug("registerArtistsFolder", "Register artists folder in #", parentNode.id);
  
        this.newVirtualContainer(parentNode, artitsLabel, (error, artistsNode) => {
          parentNode.leaveLock("scanner");

          if (error) {
            return callback(error);
          }
  
          this.registerArtist(artistsNode, itemData, artistName, callback);
        });
      });
    });
  }

  /**
   * 
   */
  registerArtist(parentNode, itemData, artistName, callback) {
    assert.equal(typeof (callback), "function", "Invalid callback parameter");

    parentNode.takeLock("scanner", () => {
  
      parentNode.getFirstVirtualChildByTitle(artistName, (error, artistNode) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        if (artistNode) {
          parentNode.leaveLock("scanner");

          return this.registerAlbum(artistNode, itemData, callback);
        }
  
        debug("registerArtist", "Register artist on #", parentNode.id, "artist=", artistName);
  
        this.newVirtualContainer(parentNode, artistName, MusicArtist.UPNP_CLASS,
            (error, artistNode) => {
              parentNode.leaveLock("scanner");

              if (error) {
                return callback(error);
              }

              this.registerAlbum(artistNode, itemData, callback);
            });
      });
    });
  }

  /**
   * 
   */
  registerAlbum(parentNode, itemData, callback) {
    assert.equal(typeof (callback), "function", "Invalid callback parameter");

    var fillAttributes = (albumNode, callback) => {
      if (true) {
        return callback();
      }
      if (!itemData.albumArtists) {
        return callback();
      }

      var modified=false;
      if (!albumNode.attributes.artists) {
        albumNode.attributes.artists = itemData.albumArtists;
        modified=true;

      } else {
        var aa = albumNode.attributes.artists;
        itemData.albumArtists.forEach((artist) => {
          if (aa.indexOf(artist) >= 0) {
            return;
          }

          aa.push(artist);
          modified=true;
        });
      }

      if (!modified) {
        return callback();
      }

      this.service.saveNode(albumNode, {
        attributes: albumNode.attributes
      }, callback);
    };

    parentNode.takeLock("scanner", () => {
  
      var album = itemData.album;
  
      parentNode.getFirstVirtualChildByTitle(album, (error, albumNode) => {
        if (error) {
          parentNode.leaveLock("scanner");

          return callback(error);
        }
  
        debug("registerAlbum", "Find album=", album, "in #", parentNode.id, "=>", !!albumNode);
  
        if (albumNode) {
          parentNode.leaveLock("scanner");

          if (albumNode.refId) {
            return callback();
          }
  
          itemData.albumItem = albumNode;
  
          fillAttributes(albumNode, (error) => {
            if (error) {
              return callback(error);
            }
  
            this.registerMusicTrack(albumNode, itemData, callback);
          });
  
          return;
        }
  
        if (itemData.albumItem) {
          // Non, pour un artiste on ne veut que les chansons de cet artiste par les autres
          // return self.newNodeRef(parentItem, itemData.albumItem, null, callback);
        }
  
        debug("registerAlbum", "New album container parent=#", parentNode.id, "name=", album);
  
        this.newVirtualContainer(parentNode, itemData.album, MusicAlbum.UPNP_CLASS,
            (error, albumNode) => {
              parentNode.leaveLock("scanner");

              if (error) {
                return callback(error);
              }
  
              itemData.albumItem = albumNode;
  
              fillAttributes(albumNode, (error) => { 
                if (error) {
                  return callback(error);
                }
  
                this.registerMusicTrack(albumNode, itemData, callback);
              });
            });
      });
    });
  }

  /**
   * 
   */
  registerMusicTrack(parentNode, itemData, callback) {
    assert.equal(typeof (callback), "function", "Invalid callback parameter");
    
    parentNode.takeLock("scanner", () => {
  
      var t = itemData.title;
  
      var appendMusicTrack = () => {
        if (itemData.musicTrackNode) {
          debug("registerMusicTrack", "Link musicTrack on #", parentNode.id, "title=", t);
  
          this.newNodeRef(parentNode, itemData.musicTrackNode, (error) => {
            parentNode.leaveLock("scanner");
            
            callback(error);
          });
          return;
        }
  
        debug("registerMusicTrack", "Create musicTrack on #", parentNode.id, "title=", t);
        this.newFile(parentNode, 
            itemData.contentURL, 
            MusicTrack.UPNP_CLASS, 
            itemData.stats, 
            itemData.attributes, 
            null, 
            (error, node) => {
              parentNode.leaveLock("scanner");
  
              if (error) {
                return callback(error);
              }
  
              itemData.musicTrackNode = node;
  
              callback(null, node);
            });      
        };
              
      parentNode.listChildrenByTitle(t, (error, musicTrackNodes, musicTrackLinks) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        debug("registerMusicTrack", "Find musicTrack=", t, "in #", parentNode.id, "=>", musicTrackNodes.length);
  
        if (!musicTrackNodes.length) {
          appendMusicTrack();
          return;
        }
  
        var mu=musicTrackNodes.find((mu) => {
          if (debug.enabled) {
            debug("registerMusicTrack", "Compare musicTrack contentURL=",
                mu.contentURL, "<>", itemData.contentURL,
                mu.contentTime, "<>", itemData.stats.mtime.getTime());
          }
  
          return (mu.contentURL === itemData.contentURL);        
        });
        
        if (mu) {
          if (itemData.stats.mtime.getTime() === mu.contentTime) {
            parentNode.leaveLock("scanner");
  
            // Same source, same date ! keep it !
            
            debug("registerMusicTrack", "Same musicTrack on #", parentNode.id, " title=",
                t, "node #", mu.id);
  
            itemData.musicTrackNode = mu;
  
            return callback(null, mu);
          }
  
          // Same source, but not the same modification time !
  
          debug("registerMusicTrack", "Not the same modification time for the same source: parent #", 
              parentNode.id, " title=", t, "node #", mu.id, "contentURL=", mu.contentURL);
  
          parentNode.removeChild(mu, (error) => {
            if (error) {
              return callback(error);
            }
            
            appendMusicTrack();
          });
          return;
        }
  
        appendMusicTrack();
      });
    });
  }
  
  /**
   * 
   */
  registerGenresFolder(parentItem, itemData, genreName, callback) {

    return this.registerGenre(parentItem, itemData, genreName, callback);
  }

  /**
   * 
   */
  registerGenre(parentNode, itemData, genreName, callback) {

    parentNode.takeLock("scanner", () => {
  
      parentNode.getFirstVirtualChildByTitle(genreName, (error, genreItem) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        if (genreItem) {
          parentNode.leaveLock("scanner");
          return this.registerAlbum(genreItem, itemData, callback);
        }
  
        this.newVirtualContainer(parentNode, genreName, MusicGenre.UPNP_CLASS,
            (error, genreItem) => {
              parentNode.leaveLock("scanner");
              if (error) {
                return callback(error);
              }
  
              this.registerAlbum(genreItem, itemData, callback);
            });
      });
    });
  }

  /**
   * 
   */
  registerAlbumsFolder(parentNode, itemData, callback) {

    parentNode.takeLock("scanner", () => {
  
      var albumsLabel = this.service.upnpServer.configuration.i18n.ALBUMS_FOLDER;
  
      parentNode.getFirstVirtualChildByTitle(albumsLabel, (error, albumsNode) => {
  
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        if (albumsNode) {
          parentNode.leaveLock("scanner");
          return this.registerAlbum(albumsNode, itemData, callback);
        }
  
        debug("registerAlbumsFolder", "Register albums folder in #", parentNode.id);
  
        this.newVirtualContainer(parentNode, albumsLabel, (error, albumsNode) => {
          parentNode.leaveLock("scanner");
          if (error) {
            return callback(error);
          }
  
          this.registerAlbum(albumsNode, itemData, callback);
        });
      });
    });
  }
}

module.exports = MusicRepository;
