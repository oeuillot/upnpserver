/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const matroska = require('matroska');
const Path = require('path');

const debug = require('debug')('upnpserver:contentHandlers:Matroska');
const logger = require('../logger');

const ContentHandler = require('./contentHandler');

class Video_Matroska extends ContentHandler {

  /**
   * 
   */
  get name() {
    return "matroska";
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {

    var contentURL = contentInfos.contentURL;

    var d1 = 0;
    if (debug.enabled) {
      debug("prepareMetas", "Parse matroska", contentURL);
      d1 = Date.now();
    }

    var parsing;

    try {
      parsing = true;

      var source = new matroska.StreamFactorySource({
        getStream(session, options, callback) {
          // console.log("getstream", options);

          debug("prepareMetas", "getStream session=", session, " options=", options);

          contentURL.createReadStream(session, options, callback);
        },
        end(session, callback) {
          debug("prepareMetas", "endStream session=", session);

          contentURL.contentProvider.end(session, callback);
        }
      });

      matroska.Decoder.parseInfoTagsAndAttachments(source, (error, document) => {

        parsing = false;

        d1 = Date.now() - d1;

        debug("prepareMetas", "Matroska parsed [" , d1 , "ms] contentURL=" , contentURL, "error=", error);

        // debug("Return ", attributes.contentURL, error, document);

        if (error || !document) {
          logger.error("Can not parse mkv " + contentURL, error);
          return callback();
        }

        if (debug.enabled) {
          debug(document.print());
        }

        var segment = document.firstSegment;
        if (!segment) {
          return callback();
        }

        var metas={};

        var info = segment.info;
        if (info) {
          if (info.title) {
            metas.title = info.title;
          }
        }

        // console.log(contentURL + "=>" + document.print());

        var tags = segment.tags;

        var attachments = segment.attachments;
        if (attachments && attachments.attachedFiles) {

          var res=[{}];

          attachments.attachedFiles.forEach((attachedFile) => {

            var fileData = attachedFile.$$fileData;
            if (!fileData) {
              return;
            }

            var name = attachedFile.fileName;
            var ret = /([^\.]*)\..*/.exec(name);
            if (ret) {
              name = ret[1];
            }

            var mimeType = attachedFile.fileMimeType;
            var png = (mimeType === "image/png");

            var r = {
                contentHandlerKey : this.name,
                key : attachedFile.fileUID,
                mimeType : mimeType,
                size : fileData.getDataSize()
//                mtime: stats.mtime.getTime()
            };

            debug("prepareMetas", "Attachment:", name, r);

            switch (name) {
            case 'cover':
            case 'cover_land':
              r.dlnaProfile = (png) ? "PNG_MED" : "JPEG_MED";
              res.push(r);
              break;

            case 'small_cover':
            case 'small_cover_land':
              r.dlnaProfile = (png) ? "PNG_TN" : "JPEG_TN";
              res.push(r);
              break;
            }
          });

          if (res.length>1) {
            metas.res=res;
          }
        }

        callback(null, metas);
      });

    } catch (x) {
      if (parsing) {
        logger.error("MKV: Parsing exception" + contentURL, x);

        return callback();
      }

      throw x;
    }
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var resKey = parseFloat(parameters[0]);

    debug("processRequest", "Process request ", resKey);

    if (isNaN(resKey)) {
      var error=new Error("Invalid resKey parameter ("+resKey+")");
      return callback(error, true);
    }

    var attributes = node.attributes;

    var contentURL = node.contentURL;
    
    var source = new matroska.StreamFactorySource({
      getStream(session, options, callback) {
        debug("processRequest", "getStream session=", session, "options=", options);        

        contentURL.createReadStream(session, options, callback);
      },
      end(session, callback) {
        debug("processRequest", "endStream session=", session);

        contentURL.contentProvider.end(session, callback);
      }
    });

    matroska.Decoder.parseInfoTagsAndAttachments(source, (error, document) => {

      if (error || !document) {
        return callback(error);
      }

      var segment = document.firstSegment;
      if (!segment) {
        return callback(new Error("No segment"), true);
      }
      var attachments = segment.attachments;
      if (!attachments) {
        return callback(new Error("No attachments"), true);
      }

      var attachedFile = attachments.attachedFiles.find((a) => a.fileUID === resKey);

      if (!attachedFile) {
        return callback(new Error("Can not find resource '" + resKey + "'"), true);
      }

      var fileData = attachedFile.$$fileData;

      var fileMimeType = attachedFile.fileMimeType;
      if (fileMimeType) {
        response.setHeader("Content-Type", fileMimeType);
      }
      response.setHeader("Content-Size", fileData.getDataSize());
      if (node.contentTime) {
        var mtime=new Date(node.contentTime);
        response.setHeader("Last-Modified", mtime.toUTCString());
      }

      fileData.getDataStream((error, stream) => {
        if (error) {
          return callback(error, true);
        }

        stream.pipe(response);

        stream.on('end', () => callback(null, true));
      });
    });
  }
}

module.exports = Video_Matroska;
