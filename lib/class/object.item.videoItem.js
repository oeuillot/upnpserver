/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var send = require('send');
var debug = require('debug')('upnpserver:class:object.item.videoItem');

var Res = require('./object.res');
var Item = require('./object.item');
var Xmlns = require('../xmlns');

var VideoItem = function() {
  Res.call(this);
};

Util.inherits(VideoItem, Res);

module.exports = VideoItem;

VideoItem.UPNP_CLASS = Item.UPNP_CLASS + ".videoItem";
VideoItem.prototype.name = VideoItem.UPNP_CLASS;

VideoItem.prototype.mimeTypes = [ 'video/*' ];

VideoItem.prototype.prepareNode = function(node, callback) {

  Res.prototype.prepareNode.call(this, node, function(error) {
    if (error) {
      return callback(error);
    }

    var attributes = node.attributes;

    if (attributes.hasSubtitle) {
      return callback();
    }

    var srtPath = attributes.contentURL.replace(/\.[^.]*$/, '.srt');
    node.service.getContentProvider(srtPath).stat(srtPath,
        function(error, stats) {
          if (error && error.code !== "ENOENT") {
            return callback(error);
          }

          if (stats && stats.isFile() && stats.size > 0) {
            attributes.hasSubtitle = "SRT";

            debug("SRT detected => " + srtPath);
          }

          return callback();
        });
  });
};

VideoItem.prototype.getDLNA_ProfileName = function(node) {
  switch (node.attributes.mime) {
  case "video/mpeg":
    return "MPEG_PS_PAL";
  }

  return Res.prototype.getDLNA_ProfileName.call(this, node);
};

VideoItem.prototype.toJXML = function(node, attributes, request,
    filterCallback, callback) {

  var self = this;

  Res.prototype.toJXML.call(this, node, attributes, request, filterCallback,
      function(error, xml) {
        if (error) {
          return callback(error);
        }

        var content = xml._content;

        // <sec:CaptionInfoEx sec:type="srt">http://192.168.0.191:17679/SubtitleProvider/41.SRT</sec:CaptionInfoEx>
        // xmlns:sec="http://www.sec.co.kr/dlna

        if (request.contentDirectoryService.secDlnaSupport) {
          if (filterCallback(Xmlns.SEC_DLNA_XMLNS, "CaptionInfoEx")) {
            content.push({
              _name : "sec:CaptionInfoEx",
              _attrs : {
                'sec:type' : 'srt'
              },
              _content : request.contentURL + node.id + "?srt=1"
            });
          }
        }

        if (filterCallback(Xmlns.DIDL_LITE, "res")) {
          if (attributes.hasSubtitle === "SRT") {

            content.push({
              _name : "res",
              _attrs : {
                protocolInfo : "http-get:*:text/srt:*"
              },
              _content : request.contentURL + node.id + "?srt=1"
            });
          }
        }

        var description;
        
        if (filterCallback(Xmlns.PURL_ELEMENT, "description")) {
          if (attributes.description) {
            description=attributes.description;
            
            content.push({
              _name : "dc:description",
              _content : description
            });
          }
        }

        if (filterCallback(Xmlns.UPNP_METADATA, "longDescription")) {
          if (attributes.longDescription && description!==attributes.longDescription) {
            content.push({
              _name : "upnp:longDescription",
              _content : attributes.longDescription
            });
          }
        }
        
        if (filterCallback(Xmlns.UPNP_METADATA, "region")) {
          if (attributes.region) {
            content.push({
              _name : "upnp:region",
              _content : attributes.region
            });
          }
        }
        
        if (filterCallback(Xmlns.JASMIN_MOVIEMETADATA, "releaseDate")) {
          if (attributes.releaseDate) {
            content.push({
              _name : "mo:releaseDate",
              _content : attributes.releaseDate
            });
          }
        }

        return callback(null, xml);
      });
};

VideoItem.prototype.processRequest = function(node, request, response, path,
    parameters, callback) {

  if (parameters && parameters.srt !== undefined) {
    return this.processSrtRequest(node, request, response, path, parameters,
        callback);
  }

  return Res.prototype.processRequest.call(this, node, request, response, path,
      parameters, callback);
};

VideoItem.prototype.processSrtRequest = function(node, request, response, path,
    parameters, callback) {

  var srtIndex = parseInt(parameters.srt, 10);
  if (srtIndex < 0) {
    return callback("Invalid srt parameter", true);
  }

  var srtPath = node.attributes.contentURL.replace(/\.[^.]*$/, '.srt');

  node.service.getContentProvider(srtPath).stat(
      srtPath,
      function(error, stats) {

        if (error) {
          return callback("No srt ? (" + srtPath + ")" + Util.inspect(error),
              true);
        }

        var stream = send(request, srtPath);
        stream.pipe(response);

        stream.on('end', function() {
          callback(null, true);
        });
      });
};
