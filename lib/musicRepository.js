/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Util = require('util');
var fs = require('fs');
var Path = require('path');
var Mime = require('mime');
var mm = require('musicmetadata');
var Async = require("async");

var Item = require('./item');
var logger = require('./logger');
var ScannerRepository = require('./scannerRepository');
var Repository = require('./repository');

// var stackTrace = require('stack-trace');

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

  // logger.debug("Process file", infos.path, " infos=", infos);

  var self = this;

  var stream;
  try {
    stream = fs.createReadStream(infos.path);

  } catch (x) {
    console.error("Can not access to " + infos.path, x);

    return callback(x);
  }

  var parser = mm(stream);
  var tags = null;

  parser.on('metadata', function(result) {
    tags = result;
  });

  parser.on('done', function(error) {
    try {
      stream.close();
    } catch (x) {
      logger.error("Can not close stream", x);
    }

    if (error) {
      logger.error("Can not parse ID3 tags of path=", infos.path, " error=",
          error);
      return callback(null);
    }
    try {
      self._construct(rootItem, infos.path, tags, callback);

    } catch (x) {
      console.error("Can not construct item ", rootItem, x);

      callback(x);
    }
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
  var artists = tags.artist || [ i18n.UNKNOWN_ARTIST ];
  var genres = tags.genre || [ i18n.UNKNOWN_GENRE ];

  var tasks = [];

  var self = this;
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

    task.fn
        .call(self, rootItem, path, task.param, album, title, tags, callback);

  }, function(error) {
    if (error) {
      return callback(error);
    }

    callback();
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
      attributes.artits = tags.artist;
      attributes.genres = tags.genre;
      attributes.album = tags.album;
      attributes.year = tags.year && parseInt(tags.year, 10);
      attributes.duration = tags.duration;
      attributes.originalTrackNumber = tags.track &&
          typeof (tags.track.no) === "number" && tags.track.no;
      if (tags.picture) {
        attributes.id3pictures = [];
        tags.picture.forEach(function(picture) {
          attributes.id3pictures.push(picture.format);
        });
      }
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

MusicRepository.prototype.processResponse = function(item, request, response,
    path, parameters, callback) {

  if (parameters && parameters.id3picture) {
    return this
        .processID3Picture(item, request, response, parameters, callback);
  }

  Repository.prototype.processResponse.call(this, item, request, response,
      path, parameters, callback);
};

MusicRepository.prototype.processID3Picture = function(item, request, response,
    parameters, callback) {

  var id3picture = parseInt(parameters.id3picture, 10);
  if (id3picture < 0) {
    return callback("Invalid id3picture parameter", true);
  }

  // console.log("Get stream of " + item.attributes.realPath);

  var stream = fs.createReadStream(item.attributes.realPath);
  var parser = mm(stream);
  var tags = null;

  parser.on('metadata', function(result) {
    tags = result;
  });

  parser.on('done', function(error) {
    // console.log("Tags=", tags);
    try {
      stream.close();
    } catch (x) {
      logger.error("Can not close stream", x);
    }

    if (error) {
      logger.error("Can not parse ID3 of " + item.attributes.realPath, error);
      return callback("Can not parse ID3", true);
    }

    if (!tags || !tags.picture || tags.picture.length <= id3picture) {
      return callback('Resource not found for item ' + item.id + " #id3=" +
          id3picture, true);
    }

    var picture = tags.picture[id3picture];

    if (!picture.format || !picture.data) {
      return callback('Invalid picture for item ' + item.id + " #id3=" +
          id3picture, true);
    }

    response.setHeader("Content-Type", Mime.lookup(picture.format));
    response.setHeader("Content-Size", picture.data.length);
    response.end(picture.data);

    return callback(null, true);
  });
};

function getNode(node, name) {
  var content = node._content;
  for (var i = 0; i < content.length; i++) {
    if (content[i]._name === name) {
      return content[i];
    }
  }

  var n = {
    _name : name
  };
  content.push(n);

  return n;
}

MusicRepository.prototype.decorateMusicTrackXML = function(item, itemXML,
    repositoryRequest, callback) {
  var dlnaSupport = this.contentDirectoryService.upnpServer.dlnaSupport;
  // var configuration = this.contentDirectoryService.upnpServer.configuration;

  var attributes = item.attributes;
  var content = itemXML._content;

  if (attributes.artist) {
    attributes.artist.forEach(function(artist) {
      if (!artist) {
        return;
      }

      content.push({
        _name : "upnp:artist",
        _content : artist
      });
    });
  }

  if (attributes.genre) {
    attributes.genre.forEach(function(genre) {
      if (!genre) {
        return;
      }

      content.push({
        _name : "upnp:genre",
        _content : genre
      });
    });
  }

  if (attributes.album) {
    content.push({
      _name : "upnp:album",
      _content : attributes.album
    });
  }

  if (attributes.year) {
    getNode(itemXML, "dc:date")._content = Item.toISODate(new Date(Date.UTC(
        attributes.year, 0)));
  }

  if (attributes.duration) {
    var d = attributes.duration;
    var ss = d % 60;
    d = (d - ss) / 60;
    var mm = d % 60;
    d = (d - mm) / 60;
    getNode(itemXML, "res")._attrs.duration = ((d > 9)
        ? d : ("0" + d)) + ":" + ((mm > 9)
        ? mm : ("0" + mm)) + ":" + ((ss > 9)
        ? ss : ("0" + ss)) + ".000";
  }

  if (attributes.originalTrackNumber) {
    content.push({
      _name : "upnp:originalTrackNumber",
      _content : attributes.originalTrackNumber
    });
  }

  if (attributes.id3pictures) {
    var pictureId = 0;
    attributes.id3pictures.forEach(function(pictureFormat) {
      if (pictureFormat === "jpg") {

        var aau = {
          _name : "upnp:albumArtURI",
          _content : repositoryRequest.contentURL + item.id + "?id3picture=" +
              pictureId
        };

        if (dlnaSupport) {
          aau._attrs = {
            "dlna:profileID" : "JPEG_TN",
            "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
          };
        }

        content.push(aau);
      }
      // <upnp:albumArtURI dlna:profileID="JPEG_TN"
      // xmlns:dlna="urn:schemas-dlnaorg:metadata-1-0/">http://10.166.15.10:41593/upnpdb/art/ed9f1485-cb92e24a-4d9f1ae4-a461e9c8.jpg</upnp:albumArtURI>
      pictureId++;
    });
  }

  return callback(null, itemXML);
};

MusicRepository.prototype.decorateMusicAlbumXML = function(item, itemXML,
    repositoryRequest, callback) {
  var content = itemXML._content;
  var configuration = this.contentDirectoryService.upnpServer.configuration;

  if (configuration.disableMusicMetadata) {
    return callback(null, itemXML);
  }

  var dlnaSupport = this.contentDirectoryService.upnpServer.dlnaSupport;

  var self = this;
  item.listChildren(function(error, list) {
    if (error) {
      logger.error("Can not list children");
      return callback(null, itemXML);
    }

    list.forEach(function(child) {
      if (!child.attributes) {
        return;
      }

      var pictures = child.attributes.id3pictures;
      if (!pictures) {
        return;
      }

      var pictureId = 0;
      pictures.forEach(function(pictureFormat) {

        if (pictureFormat === "jpg") {
          var aau = {
            _name : "upnp:albumArtURI",
            _content : repositoryRequest.contentURL + child.id +
                "?id3picture=" + pictureId
          };

          if (dlnaSupport) {
            aau._attrs = {
              "dlna:profileID" : "JPEG_TN",
              "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
            };
          }

          content.push(aau);
        }

        pictureId++;
      });

    });

    return callback(null, itemXML);
  });
};

MusicRepository.prototype.decorateJXML = function(item, itemXML,
    repositoryRequest, callback) {

  switch (item.upnpClass) {
  case Item.MUSIC_TRACK:
    return this.decorateMusicTrackXML(item, itemXML, repositoryRequest,
        callback);

  case Item.MUSIC_ALBUM:
    // Search in children if a picture is defined
    return this.decorateMusicAlbumXML(item, itemXML, repositoryRequest,
        callback);
  }

  return callback(null, itemXML);
};
