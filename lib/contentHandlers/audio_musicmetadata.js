/*jslint node: true, nomen: true, sub: true */
"use strict";

var crypto = require('crypto');

var mm = require('musicmetadata');
var Mime = require('mime');
var Util = require('util');

var debug = require('debug')('upnpserver:audio_musicmetadata');

var logger = require('../logger');
var ContentHandler = require('./contentHandler');

function Audio_MusicMetadata() {
  ContentHandler.call(this);
}

Util.inherits(Audio_MusicMetadata, ContentHandler);

module.exports = Audio_MusicMetadata;

Audio_MusicMetadata.prototype.prepareNode = function(node, callback) {

  var attributes = node.attributes;

  var path = attributes.contentURL;
  if (!path) {
    return callback();
  }

  var self = this;

  var contentProvider = node.service.getContentProvider(path);

  contentProvider.stat(path, function(error, stats) {
    if (error) {
      // console.error("Stat '" + path + "' => " + error);
      return callback(error);
    }

    contentProvider.createReadStream(null, path, null, function(error, stream) {
      if (error) {
        return callback(error);
      }

      var parsing = true;

      try {
        mm(stream, {
        // duration : true
        // fileSize : stats.size

        }, function(error, tags) {

          parsing = false;

          try {
            stream.destroy();
          } catch (x) {
            logger.error("Can not close stream", x);
          }

          if (debug.enabled) {
            debug("Musicmetadata tags of ", path, "=>", tags);
          }

          if (error) {
            logger.error("MM can not parse tags of path=", path, " error=",
                error);
            return callback();
          }

          if (!tags) {
            logger.error("MM does not support: " + path);
            return callback();
          }

          [ 'title', 'album' ].forEach(function(n) {
            if (tags[n]) {
              attributes[n] = tags[n];
            }
          });

          if (tags.duration) {
            var res = node.getRes();

            res.duration = tags.duration;
          }

          function normalize(strs) {
            var r = [];
            if (!strs || !strs.length) {
              return r;
            }
            strs.forEach(function(str) {
              str.split(',').forEach(
                  function(tok) {
                    tok = tok.replace(/\w\S*/g, function(txt) {
                      return txt.charAt(0).toUpperCase() +
                          txt.substr(1).toLowerCase();
                    });

                    r.push(tok.trim());
                  });
            });
            return r;
          }

          attributes.albumArtists = normalize(tags.albumartist);
          attributes.artists = normalize(tags.artist);
          attributes.genres = normalize(tags.genre);

          if (tags.year) {
            attributes.year = tags.year && parseInt(tags.year, 10);
          }

          var track = tags.track;
          if (track) {
            if (typeof (track.no) === "number" && track.no) {
              attributes.originalTrackNumber = track.no;

              if (typeof (track.of) === "number" && track.of) {
                attributes['trackOf'] = track.of;
              }
            }
          }
          var disk = tags.disk;
          if (disk) {
            if (typeof (disk.no) === "number" && disk.no) {
              attributes['originalDiscNumber'] = disk.no;

              if (typeof (disk.of) === "number" && disk.of) {
                attributes['diskOf'] = disk.of;
              }
            }
          }

          var otw = tags.disk && typeof (tags.disk.no) === "number" &&
              tags.track.no;
          if (otw) {
            attributes.originalTrackNumber = otw;
          }

          if (tags.picture) {
            attributes.albumArts = attributes.albumArts || [];

            var index = 0;
            tags.picture.forEach(function(picture) {
              var mimeType = Mime.lookup(picture.format);

              if (!mimeType || mimeType.indexOf("image/") !== 0) {
                return;
              }

              var hash = computeHash(picture.data);

              attributes.albumArts.push({
                contentHandlerKey : self.key,
                mimeType : mimeType,
                hash : hash,
                key : index++
              });
            });
          }

          return callback();
        });
      } catch (x) {
        if (parsing) {

          console.error("Catch ", x);
          try {
            stream.destroy();
          } catch (x) {
            logger.error("Can not close stream", x);
          }

          logger.error("MM: Parsing exception" + attributes.contentURL, x);
          return callback();
        }

        throw x;
      }

    });
  });
};

function computeHash(buffer) {
  var shasum = crypto.createHash('sha1');
  shasum.update(buffer);

  return shasum.digest('hex');
}

Audio_MusicMetadata.prototype.processRequest = function(node, request,
    response, path, parameters, callback) {

  var albumArtKey = parseInt(parameters.albumArtKey, 10);
  if (isNaN(albumArtKey) || albumArtKey < 0) {
    return callback("Invalid albumArtKey parameter (" + parameters.albumArtKey +
        ")", true);
  }

  var musicPath = node.attributes.contentURL;
  // console.log("Get stream of " + node, node.attributes);

  this._getPicture(node, musicPath, albumArtKey, function(error, picture) {

    if (!picture.format || !picture.data) {
      return callback('Invalid picture for node #' + node.id + " key=" +
          albumArtKey, true);
    }

    response.setHeader("Content-Type", picture.format);
    response.setHeader("Content-Size", picture.data.length);

    response.end(picture.data, function() {
      callback(null, true);
    });
  });
};

Audio_MusicMetadata.prototype._getPicture = function(node, path, pictureIndex,
    callback) {

  node.service.getContentProvider(node).createReadStream(null, path, null,
      function(error, stream) {
        if (error) {
          return callback(error);
        }

        mm(stream, function(error, tags) {
          try {
            stream.destroy();
          } catch (x) {
            logger.error("Can not close stream", x);
          }

          if (error) {
            logger.error("Can not parse ID3 of " + path, error);
            return callback("Can not parse ID3");
          }

          if (!tags || !tags.picture || tags.picture.length <= pictureIndex) {
            return callback('Picture #' + pictureIndex + "' not found");
          }

          var picture = tags.picture[pictureIndex];
          tags = null;

          return callback(null, picture);
        });
      });
};
