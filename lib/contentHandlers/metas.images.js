/*jslint node: true, esversion: 6, maxlen: 180 */
"use strict";

const Path = require('path');
const Async = require('async');
const Mime = require('mime');

const debug = require('debug')('upnpserver:contentHandlers:MetasImages');
const logger = require('../logger');

const MetasJson = require('./metas.json');

const gm = require('gm');

class MetasImages extends MetasJson {
  constructor(configuration) {
    super(configuration);
  }

  _tryDownloadImageURL(url, callback) {
    callback(null, false);
  }

  _addImage(metas, imageURL, imagePath, suggestedWidth, suggestedHeight, key, index, resizeWidths, isBaseURL, callback) {
    debug("_addImage", "imageURL=", imageURL, "key=", key, "index=", index);

    var resKey = key + "/" + (index + 1);

    var resize = (stats, w, h, maxw, maxh) => {
      if (w > maxw) {
        var d = maxw / w;
        w = Math.floor(d * w);
        h = Math.floor(d * h);
      }

      if (h > maxh) {
        var d2 = maxh / h;
        w = Math.floor(d2 * w);
        h = Math.floor(d2 * h);
      }

      var i = {
        contentHandlerKey: this.name,
        key: resKey,
        paramURL: "w" + maxw,
        additionalInfo: "type=" + key,
        width: w,
        height: h,
        imagePath: imagePath
      };

      if (stats) {
        i.mimeType = stats.mimeType;
        i.mtime = stats.mtime.getTime();
      } else {
        var mt = Mime.lookup(imagePath);
        if (mt) {
          i.mimeType = mt;
        }
      }
      if (isBaseURL) {
        i.baseURL = true;
      }

      metas.res.push(i);
    };

    var addSizes = (stats, w, h) => {
      metas.res = metas.res || [{}];
      var i = {
        contentHandlerKey: this.name,
        key: resKey,
        additionalInfo: "type=" + key,
        width: w,
        height: h,
        imagePath: imagePath
      };

      if (stats) {
        i.mimeType = stats.mimeType;
        i.mtime = stats.mtime.getTime();
        i.size = stats.size;
      } else {
        var mt = Mime.lookup(imagePath);
        if (mt) {
          i.mimeType = mt;
        }
      }
      if (isBaseURL) {
        i.baseURL = true;
      }

      metas.res.push(i);

      if (!resizeWidths) {
        return;
      }

      if (w > 4096 || h > 4096) {
        resize(stats, w, h, 4096, 4096);
      }

      if (w > 1024 || h > 768) {
        resize(stats, w, h, 1024, 768);
      }

      if (w > 640 || h > 480) {
        resize(stats, w, h, 640, 480);
      }

      if (w > 160 || h > 160) {
        resize(stats, w, h, 160, 160);
      }
    };

    imageURL.stat((error, stats) => {
      if (error || !stats) {
        debug("_addImage", "Can not locate imageURL", imageURL, error);

        // tmdb does not load all images ... try to download it !

        /*
        this._tryDownloadImageURL(imageURL, (error, stats) => {
          if (error) {
            console.error("Can not download image ",imageURL,"error=",error);
            return callback();
          }
 
          if (!stats) {
            return callback();
          }
 
          addSizes(stats, suggestedWidth, suggestedWidth);
          callback();
        });
        */
        addSizes(null, suggestedWidth, suggestedHeight);
        return callback();
      }
      
      if (suggestedWidth && suggestedHeight) {
        addSizes(stats, suggestedWidth, suggestedHeight);
        return callback();       
      }

      var session = null; // {}; // Does not work with gm ?
      imageURL.createReadStream(session, {}, (error, stream) => {
        if (error) {
          return callback(error);
        }

        gm(stream).identify((error, gmJson) => {
          if (error) {
            imageURL.contentProvider.end(session, (error2) => {
              callback(error || error2);
            });

            return;
          }

          //        debug("_addImage", "Image json=",json);

          var w = gmJson.size.width;
          var h = gmJson.size.height;

          addSizes(stats, w, h);
          callback();
        });
      });
    });
  }

  _convertImageSize(session, imageURL, originalStats, originalSizes, sizeSuffix, width, height, callback) {
    debug("_convertImageSize", "imageURL=", imageURL, "width=", width, "height=", height);

    if (!originalSizes) {
      imageURL.createReadStream(null, {}, (error, stream) => {
        if (error) {
          return callback(error);
        }

        gm(stream).identify((error, gmJson) => {
          if (error) {
            return callback(error);
          }

          var sizes = {
            width: gmJson.size.width,
            height: gmJson.size.height
          };
          this._convertImage(session, imageURL, originalStats, sizes, sizeSuffix, width, height, callback);
        });
      });
      return;
    }


    var reg = /(.*)\.([^.]+)$/.exec(imageURL.basename);
    if (!reg) {
      logger.error("Can not parse '" + imageURL + "'");
      return callback("Path problem");
    }

    var newBasename = reg[1] + sizeSuffix + '.' + reg[2];

    var imageURL2 = imageURL.changeBasename(newBasename);

    debug("_convertImageSize", "imageURL", imageURL, "=> imageURL2=", imageURL2);

    imageURL2.stat((error, stats2) => {
      if (!error && stats2 && stats2.size > 0) {
        debug("_convertImageSize", "date=", originalStats.mtime, "date2=", stats2.mtime);

        if (stats2.mtime.getTime() > originalStats.mtime.getTime()) {
          imageURL2.createReadStream(null, {}, (error, stream2) => {
            if (error) {
              return callback(error);
            }
            gm(stream2).identify((error, json) => {
              if (error) {
                return callback(error);
              }

              callback(null, imageURL2, stats2, json);
            });
          });
          return;
        }
      }

      imageURL.createReadStream(null, {}, (error, stream) => {
        if (error) {
          return callback(error);
        }

        imageURL2.createWriteStream({}, (error, writeStream) => {
          if (error) {
            return callback(error);
          }

          var w = originalSizes.width;
          var h = originalSizes.height;

          if (w > width) {
            var d = width / w;
            w = Math.floor(d * w);
            h = Math.floor(d * h);
          }

          if (h > height) {
            var d2 = height / h;
            w = Math.floor(d2 * w);
            h = Math.floor(d2 * h);
          }

          debug("_convertImageSize", "Resize image width=", w, "height=", h);
 
          writeStream.on('finish', () => {
            debug("_convertImageSize", "Catch end message");

            imageURL2.stat((error, stats2) => {
              debug("_convertImageSize", "Stat2=",stats2,"error=",error);
              if (error) {
                return callback(error);
              }

              imageURL2.createReadStream(null, {}, (error, stream2) => {
                debug("_convertImageSize", "Create read stream error=",error);

                if (error) {
                  return callback(error);
                }

                gm(stream2).identify((error, json2) => {
                  debug("_convertImageSize", "Identify2 json2=", json2, "error=",error);

                  if (error) {
                    return callback(error);
                  }

                  callback(null, imageURL2, stats2, json2);
                });
              });
            });
          });

          writeStream.on('error', (error) => {
            debug("_convertImageSize", "Catch error message", error);
            callback(error);
          });
          
          gm(stream).resize(w, h).stream().pipe(writeStream);
        });
      });
    });
  }
}

module.exports = MetasImages;
