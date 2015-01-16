/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var Mime = require('mime');
var send = require('send');
var assert = require('assert');

var Item = require('./object.item');

var Res = function() {
};

Util.inherits(Res, Item);

module.exports = Res;

Res.prototype.init = function(parent, name, upnpClass, container, attributes,
    callback) {
  var self = this;

  assert(attributes.realPath, "RealPath is not defined");

  Item.prototype.init.call(this, parent, name, upnpClass, container,
      attributes, function(error, name, attributes) {
        if (error) {
          return callback(error);
        }

        if (attributes.mime === undefined) {
          attributes.mime = Mime.lookup(attributes.realPath, "");
        }

        return callback(null, name, attributes);
      });
};

Res.prototype.toJXML = function(item, request, callback) {

  var self = this;

  return Item.prototype.toJXML.call(this, item, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    if (item.attributes.realPath) {
      var mimeType = item.attributes.mimeType ||
          Mime.lookup(item.attributes.realPath);

      var protocol = "http-get";
      var network = "*";
      var contentFormat = mimeType;
      var additionalInfo = "*";
 
      if (request.dlnaSupport) {
        var pn = self.getDLNA_PN(item);
        /*
         * if (mimeType) { switch (mimeType) { case "audio/mpeg": pn = "MP3"; break; case "video/mpeg": pn = "MPEG_PS_PAL";
         * break; case "image/jpeg": pn = "JPEG_SM"; break; } }
         */

        if (!pn) {
          pn = "";
        }

        additionalInfo = [ "DLNA.ORG_PN=" + pn, "DLNA.ORG_OP=01" ].join(",");
      }
      var attrs = [ protocol, network, contentFormat, additionalInfo ]
          .join(":");

      xml._content.push({
        _name : "res",
        _attrs : {
          protocolInfo : attrs
        },
        _content : request.contentURL + item.id
      });
    }
    return callback(null, xml);
  });
};

Res.prototype.getDLNA_PN = function(item) {
  return "";
};

Res.prototype.processRequest = function(item, request, response, path,
    parameters, callback) {

  // console.log("ProcessRequest of '" + item + "'", item.attributes);

  var realpath = item.attributes.realPath;

  if (!realpath) {
    response.writeHead(404, 'Resource not found: ' + item.id);
    response.end();
    return callback(null, true);
  }

  send(request, realpath).pipe(response);

  return callback(null, true);
};
