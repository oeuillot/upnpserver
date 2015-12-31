/*jslint node: true, esversion: 6 */
"use strict";

const crypto = require('crypto');

const mm = require('musicmetadata');
const Mime = require('mime');

const debug = require('debug')('upnpserver:audio_musicmetadata');

const logger = require('../logger');
const ContentHandler = require('./contentHandler');

class Audio_MusicMetadata extends ContentHandler {

  prepareNode(node, callback) {

    var attributes = node.attributes;

    var path = attributes.contentURL;
    if (!path) {
      return callback();
    }

    debug("Prepare", path);

    var contentProvider = node.service.getContentProvider(path);

    contentProvider.stat(path, (error, stats) => {
      if (error) {
        // console.error("Stat '" + path + "' => " + error);
        return callback(error);
      }

      contentProvider.createReadStream(null, path, null, (error, stream) => {
        if (error) {
          return callback(error);
        }

        var parsing = true;

        try {
          debug("Start musicMetadata #", node.id, "path=", path);
          mm(stream, {
            // duration : true
            // fileSize : stats.size

          }, (error, tags) => {

            debug("Parsed musicMetadata #", node.id, "path=", path, "tags=",
                tags, "error=", error);

            parsing = false;

            try {
              stream.destroy();
            } catch (x) {
              logger.error("Can not close stream", x);
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

            [ 'title', 'album' ].forEach((n) => {
              if (tags[n]) {
                attributes[n] = tags[n];
              }
            });

            if (tags.duration) {
              var res = node.getRes();

              res.duration = tags.duration;
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
                  attributes.trackOf = track.of;
                }
              }
            }
            var disk = tags.disk;
            if (disk) {
              if (typeof (disk.no) === "number" && disk.no) {
                attributes.originalDiscNumber = disk.no;

                if (typeof (disk.of) === "number" && disk.of) {
                  attributes.diskOf = disk.of;
                }
              }
            }

            var otw = tags.disk && typeof (tags.disk.no) === "number" &&
            tags.track.no;
            if (otw) {
              attributes.originalTrackNumber = otw;
            }

            if (tags.picture) {
              var as=[];

              var index = 0;
              tags.picture.forEach((picture) => {
                var mimeType = Mime.lookup(picture.format);

                if (!mimeType || mimeType.indexOf("image/") !== 0) {
                  return;
                }

                var hash = computeHash(picture.data);

                as.push({
                  contentHandlerKey : this.key,
                  mimeType : mimeType,
                  hash : hash,
                  key : index++
                });
              });

              if (as.length) {
                attributes.albumArts = as;
              }
            }

            return callback();
          });
        } catch (x) {
          if (parsing) {
            console.error("Catch ", x, x.stack);
            try {
              stream.destroy();

            } catch (x) {
              logger.error("Can not close stream", x);
            }

            logger.error("MM: Parsing exception" + attributes.contentURL, x);
            return callback();
          }
          console.error("Catch ", x, x.stack);

          throw x;
        }
      });
    });
  }

  processRequest(node, request, response, path, parameters, callback) {

    var albumArtKey = parseInt(parameters.albumArtKey, 10);
    if (isNaN(albumArtKey) || albumArtKey < 0) {
      return callback("Invalid albumArtKey parameter (" + parameters.albumArtKey +
          ")", true);
    }

    var musicPath = node.attributes.contentURL;
    // console.log("Get stream of " + node, node.attributes);

    this._getPicture(node, musicPath, albumArtKey, (error, picture) => {

      if (!picture.format || !picture.data) {
        return callback('Invalid picture for node #' + node.id + " key=" +
            albumArtKey, true);
      }

      response.setHeader("Content-Type", picture.format);
      response.setHeader("Content-Size", picture.data.length);

      response.end(picture.data, () => callback(null, true));
    });
  }

  _getPicture(node, path, pictureIndex, callback) {

    node.service.getContentProvider(node).createReadStream(null, path, null, (error, stream) => {
      if (error) {
        return callback(error);
      }

      mm(stream, (error, tags) => {
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
  }
}

function normalize(strs) {
  var r = [];
  if (!strs || !strs.length) {
    return undefined;
  }
  strs.forEach((str) => str.split(',').forEach(
      (tok) =>
        r.push(tok.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()).trim())
      ));
  return r;
}

function computeHash(buffer) {
  var shasum = crypto.createHash('sha1');
  shasum.update(buffer);

  return shasum.digest('hex');
}

module.exports = Audio_MusicMetadata;
