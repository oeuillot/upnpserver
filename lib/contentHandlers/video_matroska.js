/*jslint node: true, nomen: true */
"use strict";

var matroska = require('matroska');

var debug = require('debug')('upnpserver:video_matroska');

var logger = require('../logger');

function Video_Matroska() {
}

module.exports = Video_Matroska;

Video_Matroska.prototype.prepareNode = function(node, callback) {

  var attributes = node.attributes;

  var self = this;

  if (debug.enabled) {
    debug("Parse matroska " + attributes.contentURL);
  }

  var parsing;

  var decoder = new matroska.Decoder(ebml.Decoder.OnlyMetaDatas());
  try {
    parsing = true;

    decoder.parseFileInfoTagsAndAttachments(attributes.contentURL, function(
        error, document) {

      parsing = false;

      debug("Matroska parsed " + attributes.contentURL, error);

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
  if (isNaN(resKey)) {
    return callback("Invalid resKey parameter", true);
  }

  var attributes = node.attributes;

  var self = this;

  var decoder = new matroska.Decoder(ebml.Decoder.OnlyMetaDatas());
  decoder.parseFileInfoTagsAndAttachments(attributes.contentURL, function(
      error, document) {

    if (error || !document) {
      return callback(error);
    }

    var segment = document.firstSegment;
    if (!segment) {
      return callback("No segment");
    }
    var attachments = segment.firstAttachments;
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
