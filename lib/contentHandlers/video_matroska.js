/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const matroska = require('matroska');
const Path = require('path');

const debug = require('debug')('upnpserver:video_matroska');

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
  prepareMetas(contentURL, stats, callback) {

    var d1 = 0;
    if (debug.enabled) {
      debug("Parse matroska", contentURL);
      d1 = Date.now();
    }

    var parsing;

    try {
      parsing = true;

      var contentProvider = this.service.getContentProvider(contentURL);

      var source = new matroska.StreamFactorySource({
        getStream(session, options, callback) {
          // console.log("getstream", options);

          debug("getStream session=", session, " options=", options);

          contentProvider.createReadStream(session, contentURL, options, callback);
        },
        end(session, callback) {
          if (debug.enabled) {
            debug("endStream session=", session);
          }

          contentProvider.end(session, callback);
        }
      });

      matroska.Decoder.parseInfoTagsAndAttachments(source, (error, document) => {

        parsing = false;

        d1 = Date.now() - d1;

        debug("Matroska parsed [" , d1 , "ms] contentURL=" , contentURL, "error=", error);

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

          var res=[];
          metas.res = res;

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
                key : attachedFile.fileUID,
                mimeType : mimeType,
                contentHandlerKey : this.name,
                size : fileData.getDataSize()
            };

            if (debug.enabled) {
              debug("Attachment:", name, r);
            }

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
  processRequest(node, request, response,
      path, parameters, callback) {

    var resKey = parseFloat(parameters.resKey);

    debug("Process request ", resKey);

    if (isNaN(resKey)) {
      return callback("Invalid resKey parameter", true);
    }

    var attributes = node.attributes;

    var contentURL = node.contentURL;
    var contentProvider = node.service.getContentProvider(contentURL);

    var source = new matroska.StreamFactorySource({
      getStream(session, options, callback) {
        if (debug.enabled) {
          debug("getStream session=", session, "options=", options);
        }

        contentProvider.createReadStream(session, contentURL, options, callback);
      },
      end(session, callback) {
        if (debug.enabled) {
          debug("endStream session=", session);
        }

        contentProvider.end(session, callback);
      }
    });

    matroska.Decoder.parseInfoTagsAndAttachments(source, (error, document) => {

      if (error || !document) {
        return callback(error);
      }

      var segment = document.firstSegment;
      if (!segment) {
        return callback("No segment");
      }
      var attachments = segment.attachments;
      if (!attachments) {
        return callback("No attachments");
      }

      var attachedFile = attachments.attachedFiles.find((a) => a.fileUID === resKey);

      if (!attachedFile) {
        return callback("Can not find resource '" + resKey + "'", true);
      }

      var fileData = attachedFile.$$fileData;

      var fileMimeType = attachedFile.fileMimeType;
      if (fileMimeType) {
        response.setHeader("Content-Type", fileMimeType);
      }
      response.setHeader("Content-Size", fileData.getDataSize());

      fileData.getDataStream((error, stream) => {
        if (error) {
          return callback(error);
        }

        stream.pipe(response);

        stream.on('end', () => callback(null, true));
      });
    });
  }
}

module.exports = Video_Matroska;
