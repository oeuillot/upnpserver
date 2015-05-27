/*jslint node: true, nomen: true */
"use strict";

var mm = require('musicmetadata');
var Mime = require('mime');

var debug = require('debug')('upnpserver:audio_musicmetadata');

var logger = require('../logger');

function Audio_MusicMetadata() {
}

module.exports = Audio_MusicMetadata;

Audio_MusicMetadata.prototype.prepareNode = function(node, callback) {

  var attributes = node.attributes;

  var path = attributes.contentURL;

  var self = this;

  node.service.getContentProvider(path).createReadStream(
      path,
      null,
      function(error, stream) {
        if (error) {
          return callback(error);
        }

        var parsing = true;

        try {
          mm(stream, function(error, tags) {
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

            [ 'title', 'album', 'duration' ].forEach(function(n) {
              if (tags[n]) {
                attributes[n] = tags[n];
              }
            });

            attributes.artists = tags.artist;
            attributes.genres = tags.genre;

            if (tags.year) {
              attributes.year = tags.year && parseInt(tags.year, 10);
            }

            var otw = tags.track && typeof (tags.track.no) === "number" &&
                tags.track.no;
            if (otw) {
              attributes.originalTrackNumber = otw;
            }

            if (tags.picture) {
              attributes.albumArts = attributes.albumArts || [];

              var index = 0;
              tags.picture.forEach(function(picture) {
                attributes.albumArts.push({
                  contentHandlerKey : self.key,
                  format : picture.format,
                  key : index++
                });
              });
            }

            return callback();
          });
        } catch (x) {
          if (parsing) {
            console.error(x);
            return callback();
          }

          throw x;
        }

      });

};

Audio_MusicMetadata.prototype.processRequest = function(node, request,
    response, path, parameters, callback) {

  var albumArtKey = parseInt(parameters.albumArtKey, 10);
  if (isNaN(albumArtKey) || albumArtKey < 0) {
    return callback("Invalid albumArtKey parameter (" + parameters.albumArtKey +
        ")", true);
  }

  var path = node.attributes.contentURL;
  // console.log("Get stream of " + node, node.attributes);

  this._getPicture(node, path, albumArtKey, function(error, picture) {

    if (!picture.format || !picture.data) {
      return callback('Invalid picture for node #' + node.id + " key=" +
          albumArtKey, true);
    }

    response.setHeader("Content-Type", Mime.lookup(picture.format));
    response.setHeader("Content-Size", picture.data.length);

    response.end(picture.data, function() {
      callback(null, true);
    });
  });
};

Audio_MusicMetadata.prototype._getPicture = function(node, path, pictureIndex,
    callback) {

  node.service.getContentProvider(node).createReadStream(path, null,
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
