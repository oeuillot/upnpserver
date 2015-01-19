/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var fs = require('fs');
var send = require('send');

var Res = require('./object.res');
var Item = require('./object.item');
var logger = require('../logger');

var VideoItem = function() {
};

Util.inherits(VideoItem, Res);

module.exports = VideoItem;

VideoItem.ParentClass = Item;
VideoItem.UPNP_CLASS = VideoItem.ParentClass.UPNP_CLASS + ".videoItem";

VideoItem.prototype.init = function(parent, name, upnpClass, container,
    attributes, callback) {

  Res.prototype.init.call(this, parent, name, upnpClass, container, attributes,
      function(error, name, attributes) {
        if (error) {
          return callback(error);
        }

        var srtPath = attributes.realPath.replace(/\.[^.]*$/, '.srt');
        fs.exists(srtPath, function(exists) {
          attributes.hasSRT = exists;

          logger.debug("Has SRT=" + exists + " " + srtPath);

          return callback(null, name, attributes);
        });
      });
};

VideoItem.prototype.getDLNA_PN = function(item) {
  switch (item.attributes.mime) {
  case "video/mpeg":
    return "MPEG_PS_PAL";
  }

  /*
   * case "video/mpeg": pn = "MPEG_PS_PAL"; break; case "image/jpeg": pn = "JPEG_SM";
   */

  return Res.prototype.getDLNA_PN.call(this, item);
};

VideoItem.prototype.toJXML = function(item, request, callback) {

  var self = this;

  Res.prototype.toJXML.call(this, item, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    var attributes = item.attributes;
    var content = xml._content;

    if (attributes.hasSRT) {
      content.push({
        _name : "res",
        _attrs : {
          protocolInfo : "http-get:*:text/srt:*"
        },
        _content : request.contentURL + item.id + "?srt=0"
      });
    }

    // console.log("VIdeoItem.xml=", xml);

    return callback(null, xml);
  });
};

VideoItem.prototype.processRequest = function(item, request, response, path,
    parameters, callback) {

  if (parameters && parameters.srt) {
    return this.processSrtRequest(item, request, response, path, parameters,
        callback);
  }

  return Res.prototype.processRequest.call(this, item, request, response, path,
      parameters, callback);
};

VideoItem.prototype.processSrtRequest = function(item, request, response, path,
    parameters, callback) {

  var srtIndex = parseInt(parameters.srt, 10);
  if (srtIndex < 0) {
    return callback("Invalid srt parameter", true);
  }

  var srtPath = item.attributes.realPath.replace(/\.[^.]*$/, '.srt');
  fs.exists(srtPath, function(exists) {

    if (!exists) {
      return callback("No srt defined !", true);
    }

    send(request, srtPath).pipe(response);

    return callback(null, true);
  });
};
