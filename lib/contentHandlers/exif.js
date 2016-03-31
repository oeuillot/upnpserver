/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:contentHandlers:Exif');
const Exif = require('exif');

const ContentHandler = require('./contentHandler');

const logger=require('../logger');

class ExifContentHandler extends ContentHandler {

  get name() {
    return "exif";
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {
    debug("Prepare metas of", contentInfos);

    var contentURL = contentInfos.contentURL;

    contentURL.readContent(null, (error, imageData) => {
      if (error) {
        logger.error("Can not get content of '"+contentURL+"'",error);
        return callback(error);
      }

      new Exif.ExifImage({ image : imageData, fixThumbnailOffset: true }, (error, exifData) => {
        if (error) {
          logger.error("Can not parse exif '"+contentURL+"'", error);
          return callback(error);
        }

        filter(exifData);

        var res;
        var thumbnail=exifData.thumbnail;
        if (thumbnail) {
          delete exifData.thumbnail;

          if (thumbnail.ThumbnailOffset && thumbnail.ThumbnailLength) {

            var thumbnailMimeType;
            if (isJPEG(imageData, thumbnail.ThumbnailOffset)) {
              thumbnailMimeType="image/jpeg";
            }
            
            if (thumbnailMimeType) {
              res=res || [{}];

              res.push({
                contentHandlerKey : this.name,
                key : "thumbnail",
                mimeType : thumbnailMimeType,
                size : thumbnail.ThumbnailLength,
                _start: thumbnail.ThumbnailOffset
              });
            }
          }
        }
        var exif=exifData;
        if (exif) {
          res=res || [{}];

          if (exif.ExifImageWidth) {
            res[0].width=exif.ExifImageWidth;
          }
          if (exif.ExifImageHeight) {
            res[0].height=exif.ExifImageHeight;
          }
          if (exif.DateTimeOriginal) {
            var ds=exif.DateTimeOriginal;
            var reg=/^(\d{4}).(\d{2}).(\d{2}).(\d{2}).(\d{2}).(\d{2})/.exec(ds);
            if (reg) {
              exifData.dateTimeOriginal=new Date(parseInt(reg[1]), parseInt(reg[2])-1, parseInt(reg[3]), 
                  parseInt(reg[4]), parseInt(reg[5]), parseInt(reg[6])); 
              exifData.date=exifData.dateTimeOriginal;
            }
          }
        }

        if (res) {
          exifData.res=res;
        }

        callback(null, exifData);
      });      
    });
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var resKey = parameters[0];
    var res = this.getResourceByParameter(node, resKey);

    debug("ProcessRequest", "resKey=", resKey, "=>", res);

    if (!res) {
      var error=new Error("Invalid resKey parameter ("+resKey+")");
      return callback(error, true);
    }

    this.sendResource(node.contentURL, res, request, response, callback);
  }
}

module.exports = ExifContentHandler;

function isJPEG(data, offset) {
  debug("IsJPEG: offset=",offset,"data=",data[offset],data[offset+1],data[offset+2]);
  return (data[offset]===0xff) && (data[offset+1]===0xd8) && (data[offset+2]===0xff) && (data[offset+3]===0xdb);
}

function filter(json) {
  for(var n in json) {
    var v=json[n];
    if (typeof(v)!=="object") {
      continue;
    }

    if (v===null) {
      continue;
    }
    if (v instanceof Array) {
      continue;
    }
    if (Buffer.isBuffer(v)) {
      delete json[n];
      continue;
    }
    if (v instanceof Date) {
      continue;
    }
    if (!Object.keys(v).length) {
      delete json[n];
      continue;
    }
    
    filter(v);
  }
}
