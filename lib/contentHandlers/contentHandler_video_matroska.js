/*jslint node: true, nomen: true */
"use strict";

var matroska = require('matroska');
var Path = require('path');
var Util = require('util');

var debug = require('debug')('upnpserver:video_matroska');

var logger = require('../logger');
var ContentHandler = require('./contentHandler');

function Video_Matroska() {
  ContentHandler.call(this);

  this.key = "matroska";
  this.mimeTypes = ["video/x-matroska"];
  this.priority = 0;
}

module.exports = Video_Matroska;

Util.inherits(Video_Matroska, ContentHandler);

Video_Matroska.prototype.prepareNode = function(node, callback) {

  var attributes = node.attributes;

  var contentURL = attributes.contentURL;
  if (!contentURL) {
    return callback();
  }

  var self = this;

  var d1 = 0;
  if (debug.enabled) {
    debug("Parse matroska " + attributes.contentURL);
    d1 = Date.now();
  }

  var parsing;

  try {
    parsing = true;

    var contentProvider = node.service.getContentProvider(contentURL);

    var source = new matroska.StreamFactorySource({
      getStream : function(session, options, callback) {
        // console.log("getstream", options);
        if (debug.enabled) {
          debug("getStream session=", session, " options=", options);
        }

        contentProvider
            .createReadStream(session, contentURL, options, callback);
      },
      end : function(session, callback) {
        if (debug.enabled) {
          debug("endStream session=", session);
        }

        contentProvider.end(session, callback);
      }
    });

    matroska.Decoder.parseInfoTagsAndAttachments(source,
        function(error, document) {

          parsing = false;

          d1 = Date.now() - d1;

          if (debug.enabled) {
            debug("Matroska parsed [" + d1 + "ms] " + attributes.contentURL,
                error);
          }

          // debug("Return ", attributes.contentURL, error, document);

          if (error || !document) {
            logger.error("Can not parse mkv " + attributes.contentURL, error);
            return callback();
          }

          if (debug.enabled) {
            debug(document.print());
          }

          var segment = document.firstSegment;
          if (!segment) {
            return callback();
          }
          var info = segment.info;
          if (info) {
            if (info.title) {
              attributes.title = info.title;
            }
          }

          var tags = segment.tags;

          var attachments = segment.attachments;
          if (attachments && attachments.attachedFiles) {

            attributes.res = attributes.res || [];

            attachments.attachedFiles.forEach(function(attachedFile) {

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
                contentHandlerKey : self.key,
                size : fileData.getDataSize()
              };

              if (debug.enabled) {
                debug("Attachment:", name, r);
              }

              switch (name) {
              case 'cover':
              case 'cover_land':
                r.dlnaProfile = (png) ? "PNG_MED" : "JPEG_MED";
                attributes.res.push(r);
                break;

              case 'small_cover':
              case 'small_cover_land':
                r.dlnaProfile = (png) ? "PNG_TN" : "JPEG_TN";
                attributes.res.push(r);
                break;

              }
            });
          }

          callback();
        });

  } catch (x) {
    if (parsing) {
      logger.error("MKV: Parsing exception" + attributes.contentURL, x);

      return callback();
    }

    throw x;
  }
};

Video_Matroska.prototype.processRequest = function(node, request, response,
    path, parameters, callback) {

  var resKey = parseFloat(parameters.resKey);

  debug("Process request ", resKey);

  if (isNaN(resKey)) {
    return callback("Invalid resKey parameter", true);
  }

  var attributes = node.attributes;

  var self = this;

  var contentURL = attributes.contentURL;
  var contentProvider = node.service.getContentProvider(contentURL);

  var source = new matroska.StreamFactorySource({
    getStream : function(session, options, callback) {
      if (debug.enabled) {
        debug("getStream session=", session, "options=", options);
      }

      contentProvider.createReadStream(session, contentURL, options, callback);
    },
    end : function(session, callback) {
      if (debug.enabled) {
        debug("endStream session=", session);
      }

      contentProvider.end(session, callback);
    }
  });

  matroska.Decoder.parseInfoTagsAndAttachments(source,
      function(error, document) {

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

        var af = attachments.attachedFiles;
        for (var i = 0; i < af.length; i++) {
          var attachedFile = af[i];
          if (attachedFile.fileUID !== resKey) {
            continue;
          }

          var fileData = attachedFile.$$fileData;

          var fileMimeType = attachedFile.fileMimeType;
          if (fileMimeType) {
            response.setHeader("Content-Type", fileMimeType);
          }
          response.setHeader("Content-Size", fileData.getDataSize());

          fileData.getDataStream(function(error, stream) {
            if (error) {
              return callback(error);
            }

            stream.pipe(response);

            stream.on('end', function() {
              callback(null, true);
            });
          });

          return;
        }

        return callback("Can not find resource '" + resKey + "'", true);
      });
};
