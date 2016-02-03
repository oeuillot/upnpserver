/*jslint node: true, esversion: 6 */
"use strict";

const crypto = require('crypto');

const mm = require('musicmetadata');
const Mime = require('mime');

const debug = require('debug')('upnpserver:contentHandlers:Musicmetadata');

const logger = require('../logger');
const ContentHandler = require('./contentHandler');

class Audio_MusicMetadata extends ContentHandler {

  /**
   * 
   */
  get name() {
    return "musicMetadata";
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {

    debug("Prepare", contentInfos);

    var contentURL = contentInfos.contentURL;
    var contentProvider = contentInfos.contentProvider;

    contentProvider.createReadStream(null, contentURL, null, (error, stream) => {
      if (error) {
        return callback(error);
      }

      var parsing = true;

      try {
        debug("Start musicMetadata contentURL=", contentURL);
        mm(stream, {
          // duration : true
          // fileSize : stats.size

        }, (error, tags) => {
 
          try {
            stream.destroy();
          } catch (x) {
            logger.error("Can not close stream", x);
          }
          
          parsing = false;

          if (error) {
            logger.error("MM can not parse tags of contentURL=", contentURL, " error=",
                error);
            return callback();
          }
          
          debug("Parsed musicMetadata contentURL=", contentURL, "tags=", tags);

          if (!tags) {
            logger.error("MM does not support: " + contentURL);
            return callback();
          }

          var metas={};

          [ 'title', 'album', 'duration' ].forEach((n) => {
            if (tags[n]) {
              metas[n] = tags[n];
            }
          });

          metas.albumArtists = normalize(tags.albumartist);
          metas.artists = normalize(tags.artist);
          metas.genres = normalize(tags.genre);

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

          var otw = tags.disk && typeof (tags.disk.no) === "number" &&
          tags.track.no;
          if (otw) {
            metas.originalTrackNumber = otw;
          }

          if (tags.picture) {
            var as=[];
            var res=[{}];            

            var index = 0;
            tags.picture.forEach((picture) => {
              var mimeType = Mime.lookup(picture.format);

              var key=index++;
              
              if (!mimeType) {
                return;
              }

              if (!mimeType.indexOf("image/")) {

                var hash = computeHash(picture.data);

                as.push({
                  contentHandlerKey : this.name,
                  mimeType : mimeType,
                  size: picture.data.length,
                  hash : hash,
                  key : key
                });
                return;
              }

              res.push({
                contentHandlerKey : this.name,
                mimeType : mimeType,
                size: picture.data.length,
                key : key
              });
                           
            });

            if (as.length) {
              metas.albumArts = as;
            }
            if (res.length>1) {
              metas.res=res;
            }
          }

          callback(null, metas);
        });
      } catch (x) {
        if (parsing) {
          console.error("Catch ", x, x.stack);
          try {
            stream.destroy();

          } catch (x) {
            logger.error("Can not close stream", x);
          }

          logger.error("MM: Parsing exception contentURL=" + contentURL, x);
          return callback();
        }
        logger.error("Catch ", x, x.stack);

        throw x;
      }
    });    
  }

  /**
   *
   */
  processRequest(node, request, response, path, parameters, callback) {

    var albumArtKey = parseInt(parameters[0], 10);
    if (isNaN(albumArtKey) || albumArtKey < 0) {
      let error=new Error("Invalid albumArtKey parameter (" + parameters + ")");
      error.node=node;
      error.request=request;
      
      return callback(error, false);
    }

    var contentURL = node.contentURL;
    // console.log("Get stream of " + node, node.attributes);

    this._getPicture(node, contentURL, albumArtKey, (error, picture) => {

      if (!picture.format || !picture.data) {
        let error=new Error('Invalid picture for node #' + node.id + ' key=' + albumArtKey);
        error.node=node;
        error.request=request;
        
        return callback(error, false);
      }

      response.setHeader("Content-Type", picture.format);
      response.setHeader("Content-Size", picture.data.length);

      response.end(picture.data, () => callback(null, true));
    });
  }

  _getPicture(node, contentURL, pictureIndex, callback) {

    this.service.getContentProvider(contentURL).createReadStream(null, contentURL, null, (error, stream) => {
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
          let error=new Error('Picture #' + pictureIndex + ' not found');

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
