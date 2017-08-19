/*jslint node: true, esversion: 6 */
"use strict";

const crypto = require('crypto');

const mm = require('music-metadata');
const Mime = require('mime');

const debug = require('debug')('upnpserver:contentHandlers:Musicmetadata');

const logger = require('../logger');
const ContentHandler = require('./contentHandler');

class Audio_MusicMetadata extends ContentHandler {

  /**
   *
   */
  get name () {
    return "musicMetadata";
  }

  /**
   *
   */
  prepareMetas (contentInfos, context, callback) {

    debug("Prepare", contentInfos);

    const contentURL = contentInfos.contentURL;

    let parsing = true;

    debug("Start musicMetadata contentURL=", contentURL);

    mm.parseFile(contentURL.path, {
      // duration : true
      // fileSize : stats.size
    }).then((tags) => {

      parsing = false;

      debug("Parsed musicMetadata path=", contentURL.path, "tags=", tags);

      if (!tags) {
        logger.error("MM does not support: " + contentURL.path);
        return callback();
      }

      const metas = {};

      ['title', 'album', 'duration'].forEach((n) => {
        if (tags[n]) {
          metas[n] = tags[n];
        }
      });

      metas.albumArtists = tags.common.albumartist ? [tags.common.albumartist] : tags.common.artists;
      metas.artists = tags.common.artists ? tags.common.artists : [tags.common.albumartist];
      metas.genres = tags.common.genre;

      if (tags.year) {
        metas.year = tags.year && parseInt(tags.year, 10);
      }

      var track = tags.track;
      if (track) {
        if (typeof (track.no) === "number" && track.no) {
          metas.originalTrackNumber = track.no;

          if (typeof (track.of) === "number" && track.of) {
            metas.trackOf = track.of;
          }
        }
      }

      var disk = tags.disk;
      if (disk) {
        if (typeof (disk.no) === "number" && disk.no) {
          metas.originalDiscNumber = disk.no;

          if (typeof (disk.of) === "number" && disk.of) {
            metas.diskOf = disk.of;
          }
        }
      }

      if (tags.picture) {
        var as = [];
        var res = [{}];

        var index = 0;
        tags.picture.forEach((picture) => {
          var mimeType = Mime.lookup(picture.format);

          var key = index++;

          if (!mimeType) {
            return;
          }

          if (!mimeType.indexOf("image/")) {

            var hash = computeHash(picture.data);

            as.push({
              contentHandlerKey: this.name,
              mimeType: mimeType,
              size: picture.data.length,
              hash: hash,
              key: key
            });
            return;
          }

          res.push({
            contentHandlerKey: this.name,
            mimeType: mimeType,
            size: picture.data.length,
            key: key
          });

        });

        if (as.length) {
          metas.albumArts = as;
        }
        if (res.length > 1) {
          metas.res = res;
        }
      }

      callback(null, metas);
    }).catch((err) => {
      logger.error("MM can not parse tags of contentURL=", contentURL, " error=",
        err);
      return callback();
    });
  }

  /**
   *
   */
  processRequest (node, request, response, path, parameters, callback) {

    var albumArtKey = parseInt(parameters[0], 10);
    if (isNaN(albumArtKey) || albumArtKey < 0) {
      let error = new Error("Invalid albumArtKey parameter (" + parameters + ")");
      error.node = node;
      error.request = request;

      return callback(error, false);
    }

    var contentURL = node.contentURL;
    // console.log("Get stream of " + node, node.attributes);

    this._getPicture(node, contentURL, albumArtKey, (error, picture) => {

      if (!picture.format || !picture.data) {
        let error = new Error('Invalid picture for node #' + node.id + ' key=' + albumArtKey);
        error.node = node;
        error.request = request;

        return callback(error, false);
      }

      response.setHeader("Content-Type", picture.format);
      response.setHeader("Content-Size", picture.data.length);

      response.end(picture.data, () => callback(null, true));
    });
  }

  _getPicture (node, contentURL, pictureIndex, callback) {

    contentURL.createReadStream(null, null, (error, stream) => {
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
          logger.error("Can not parse ID3 of " + contentURL, error);
          return callback("Can not parse ID3");
        }

        if (!tags || !tags.picture || tags.picture.length <= pictureIndex) {
          let error = new Error('Picture #' + pictureIndex + ' not found');

          logger.error(error);
          return callback(error);
        }

        var picture = tags.picture[pictureIndex];
        tags = null;

        callback(null, picture);
      });
    });
  }
}

function computeHash (buffer) {
  var shasum = crypto.createHash('sha1');
  shasum.update(buffer);

  return shasum.digest('hex');
}

module.exports = Audio_MusicMetadata;
