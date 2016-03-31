/*jslint node: true, esversion: 6 */
"use strict";

const Path = require('path');
const Async = require('async');

const debug = require('debug')('upnpserver:contentHandlers:metasImages');
const logger = require('../logger');

const MetasJson = require('./metas.json');

const gm = require('gm');

class MetasImages extends MetasJson {
  constructor(configuration) {
    super(configuration);
  }

  _addImage(metas, imageURL, key, type, resizeWidths, callback) {
    debug("_addImage", "imageURL=",imageURL,"key=",key,"type=",type);

    imageURL.stat((error, stats) => {        
      if (error) {
        console.error("Can not locate imageURL", imageURL, error);
        return callback();
      }

      var session=null; // {}; // Does not work with gm ?
      imageURL.createReadStream(session, {}, (error, stream) => {
        if (error) {
          return callback(error);
        }

        gm(stream).identify((error, json) => {
          if (error) {
            imageURL.contentProvider.end(session, (error2) => {
              callback(error || error2);
            });

            return;
          }

//        debug("_addImage", "Image json=",json);

          var tasks=[];

          var resize = (maxw, maxh) => {
            return (callback) => {
              var w = (json.size.width>maxw)?maxw:null;
              var h = (json.size.height>maxh)?maxh:null;
              this._convertImageSize(session, imageURL, stats, maxw, w, h,
                  (error, pathGenerated, statsGenerated, jsonGenerated)=> {
                    if (error) {
                      return callback(error);
                    }

                    metas.res=metas.res || [{}];
                    metas.res.push({
                      contentHandlerKey : this.name,
                      key : key,
                      paramURL: "w"+maxw,
                      mimeType : stats.mimeType,
                      size : statsGenerated.size,
                      additionalInfo : "type="+type,
                      mtime: statsGenerated.mtime.getTime(),
                      width: jsonGenerated.size.width,
                      height: jsonGenerated.size.height
                    });

                    callback();
                  });
            };  
          };

          tasks.push((callback) => {
            metas.res=metas.res || [{}];
            metas.res.push({
              contentHandlerKey : this.name,
              key : key,
              mimeType : stats.mimeType,
              size : stats.size,
              additionalInfo : "type="+type,
              mtime: stats.mtime.getTime(),
              width: json.size.width,
              height: json.size.height
            });

            callback();
          });

          if (resizeWidths && json.size) {
            if (json.size.width>4096 || json.size.height>4096) {
              tasks.push(resize(4096, 4096));
            }        

            if (json.size.width>1024 || json.size.height>768) {
              tasks.push(resize(1024, 768));
            }        

            if (json.size.width>640 || json.size.height>480) {
              tasks.push(resize(640, 480));
            }        

            if (json.size.width>160 || json.size.height>160) {
              tasks.push(resize(160, 160));
            }        
          }

          Async.series(tasks, (error) => {
            imageURL.contentProvider.end(session, (error2) => {
              if (error2) {
                logger.error(error2);
              }
              callback(error | error2);
            });
          });
        });     
      });
    });
  }

  _convertImageSize(session, imageURL, originalStats, sizeName, width, height, callback) {
    debug("_convertImageSize", "imageURL=",imageURL,"width=",width,"height=",height);

    var reg=/(.*)\.([^.]+)$/.exec(imageURL.basename);
    if (!reg) {
      logger.error("Can not parse '"+imageURL+"'");
      return callback("Path problem");
    }

    var newBasename=reg[1]+'_w'+sizeName+'.'+reg[2];
    
    var imageURL2 = imageURL.changeBasename(newBasename);

    debug("_convertImageSize", "imageURL",imageURL, "=> imageURL2=",imageURL2);

    imageURL2.stat((error, stats2) => {
      if (!error && stats2 && stats2.size>0) {
        debug("_convertImageSize", "date=",originalStats.mtime,"date2=",stats2.mtime);

        if (stats2.mtime.getTime()>originalStats.mtime.getTime()) {
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

      imageURL.createReadStream(session, {}, (error, stream) => {
        if (error) {
          return callback(error);
        }

        imageURL2.createWriteStream({}, (error, writeStream) => {
          if (error) {
            return callback(error);
          }

          debug("_convertImageSize", "Resize image width=",width);
          var st=gm(stream).resize(width, height).stream().pipe(writeStream);

          writeStream.on('finish', () => {
            debug("_convertImageSize", "Catch end message");

            imageURL2.stat((error, stats2) => {
              if (error) {
                return callback(error);
              }

              imageURL2.createReadStream(null, {}, (error, stream2) => {
                if (error) {
                  return callback(error);
                }

                gm(stream2).identify((error, json2) => {
                  if (error) {
                    return callback(error);
                  }

                  callback(null, imageURL2, stats2, json2);
                });
              });
            });
          });

          writeStream.on('error', (error) => {
            debug("_convertImageSize", "Catch error message",error);
            callback(error);
          });
        });
      });
    });
  }
}

module.exports = MetasImages;
