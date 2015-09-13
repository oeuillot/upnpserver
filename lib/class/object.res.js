/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var Mime = require('mime');
var send = require('send');
var assert = require('assert');
var async = require('async');

var Item = require('./object.item');
var Repository = require('../repositories/repository');
var Xmlns = require('../xmlns');

var ImageItem;

var RES_PROPERTIES = [ 'size', 'duration', 'bitrate', 'sampleFrequency',
    'bitsPerSample', 'nrAudioChannels', 'resolution', 'colorDepth', 'tspec',
    'allowedUse', 'validityStart', 'validityEnd', 'remainingTime', 'usageInfo',
    'rightsInfoURI', 'contentInfoURI', 'recordQuality', 'daylightSaving',
    'framerate', 'importURI' ];

var Res = function() {
  Item.call(this);

  if (!ImageItem) {
    ImageItem = require('./object.item.imageItem');
  }
};

Util.inherits(Res, Item);

module.exports = Res;

Res.prototype.prepareNode = function(node, callback) {
  var self = this;

  Item.prototype.prepareNode.call(this, node, function(error) {
    if (error) {
      return callback(error);
    }

    var attributes = node.attributes;
    assert(typeof (attributes) === "object", "No attributes for node " +
        node.id);

    var ret = /(.*)__.*$/.exec(node.name);
    if (ret) {
      attributes.title = ret[1];
    }

    var contentURL = attributes.contentURL;
    if (!contentURL) {
      return callback(null, node);
    }

    if (attributes.mime === undefined) {
      attributes.mime = Mime.lookup(contentURL, "");
    }

    if ((attributes.date !== undefined) && (attributes.size !== undefined)) {
      return callback(null, node);
    }

    // allow external medias not stored on this server, without stream to handle
    if (attributes.externalContentURL) {
      return callback(null, node);
    }

    node.service.getContentProvider(contentURL)
        .stat(
            contentURL,
            function(error, stats) {
              if (error) {
                return callback(error);
              }

              if (!node.service.device.configuration.strict &&
                  !attributes.size) {
                attributes.size = stats.size;
              }

              Repository.fillDates(attributes, stats);

              callback(null, node);
            });
  });
};

Res.prototype.toJXML = function(node, attributes, request, filterCallback,
    callback) {

  var self = this;

  return Item.prototype.toJXML.call(this, node, attributes, request,
      filterCallback, function(error, xml) {
        if (error) {
          return callback(error);
        }

        var content = xml._content;

        if (filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
          if (attributes.albumArts) {
            attributes.albumArts.forEach(function(albumArtInfo) {

              if (ImageItem.isMimeTypeImage(albumArtInfo.mimeType)) {
                var aau = {
                  _name : "upnp:albumArtURI",
                  _content : request.contentURL + node.id + "?contentHandler=" +
                      albumArtInfo.contentHandlerKey + "&albumArtKey=" +
                      albumArtInfo.key
                };

                if (request.dlnaSupport) {
                  var dlna = albumArtInfo.dlnaProfile ||
                      ImageItem.getDLNA(albumArtInfo.mimeType);
                  if (dlna) {
                    aau._attrs = {
                      "dlna:profileID" : dlna,
                      "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
                    };
                  }
                }

                content.push(aau);
              }
            });
          }
        }

        if (filterCallback(Xmlns.DIDL_LITE, "res")) {
          if (attributes.contentURL || attributes.externalContentURL) {
            var resAttributes = {};

            if (filterCallback(Xmlns.DIDL_LITE, "res", "protocolInfo")) {
              var mimeType = attributes.mime ||
                  Mime.lookup(attributes.contentURL);

              var protocol = "http-get";
              var network = "*";
              var contentFormat = mimeType;
              var additionalInfo = "*";

              if (request.dlnaSupport) {
                var pn = self.getDLNA_ProfileName(node);
                if (!pn) {
                  pn = "";
                }

                additionalInfo = [ "DLNA.ORG_PN=" + pn, "DLNA.ORG_OP=01",
                    "DLNA.ORG_FLAGS=01700000000000000000000000000000" ]
                    .join(";");
              }

              var attrs = [ protocol, network, contentFormat, additionalInfo ]
                  .join(":");

              resAttributes.protocolInfo = attrs;
            }

            [ 'size', 'duration', 'bitrate', 'sampleFrequency',
                'bitsPerSample', 'nrAudioChannels' ].forEach(function(n) {
              if (attributes[n] && filterCallback(Xmlns.DIDL_LITE, "res", n)) {
                resAttributes[n] = attributes[n];
              }
            });

            var contentURL = attributes.externalContentURL ||
                (request.contentURL + node.id);

            content.push({
              _name : "res",
              _attrs : resAttributes,
              _content : contentURL
            });
          }

          if (attributes.res) {
            attributes.res.forEach(function(r) {
              _addRes(xml, attributes, r, request, node, filterCallback);
            });
          }
        }

        if (filterCallback(Xmlns.PURL_ELEMENT, "date")) {
          var dcDate = Item._getNode(xml, "dc:date");
          if (!dcDate._content) {
            var date = attributes.modifiedTime;
            if (date) {
              dcDate._content = Item.toISODate(date);
            }
          }
        }

        callback(null, xml);
      });
};

function _addRes(xml, attributes, res, request, node, filterCallback) {
  var resAttributes = {};

  if (filterCallback(Xmlns.DIDL_LITE, "res", "protocolInfo")) {
    var protocol = "http-get";
    var network = res.network || "*";
    var contentFormat = res.mimeType;
    var additionalInfo = res.additionalInfo;

    if (request.dlnaSupport) {
      var pn = res.dlnaProfile;
      if (!pn) {
        pn = ImageItem.getDLNA(res.mimeType, res.width, res.height);
      }

      var adds = [];
      if (additionalInfo) {
        adds.push(additionalInfo);
      }

      adds.push("DLNA.ORG_PN=" + pn,
          "DLNA.ORG_FLAGS=00f00000000000000000000000000000");

      additionalInfo = adds.join(";");
    }

    var attrs = [ protocol, network, contentFormat, additionalInfo || "*" ]
        .join(":");

    resAttributes.protocolInfo = attrs;
  }

  RES_PROPERTIES.forEach(function(n) {
    if (res[n] === undefined) {
      return;
    }
    if (!filterCallback(Xmlns.DIDL_LITE, "res", n)) {
      return;
    }

    resAttributes[n] = res[n];
  });

  if (request.secDlnaSupport) {

    // TODO
    // <res sec:acodec="aac" sec:vcodec="mpeg4" duration="00:03:09"

    if (res.acodec) {
      if (filterCallback(Xmlns.DIDL_LITE, "res", "sec:acodec")) {
        resAttributes["sec:acodec"] = res.acodec;
      }
    }

    if (res.vcodec) {
      if (filterCallback(Xmlns.DIDL_LITE, "res", "sec:vcodec")) {
        resAttributes["sec:vcodec"] = res.vcodec;
      }
    }
  }

  var contentURL = request.contentURL + node.id + "?contentHandler=" +
      res.contentHandlerKey + "&resKey=" + res.key;

  xml._content.push({
    _name : "res",
    _attrs : resAttributes,
    _content : contentURL
  });
}

Res.prototype.getDLNA_ProfileName = function(item) {
  return "";
};

Res.prototype.processRequest = function(node, request, response, path,
    parameters, callback) {

  // console.log("ProcessRequest of '" + item + "'", item.attributes);

  Item.prototype.processRequest(node, request, response, path, parameters,
      function(error, processed) {
        if (error || processed) {
          return callback(error, processed);
        }

        var realpath = node.attributes.contentURL;

        if (!realpath) {
          response.writeHead(404, 'Resource not found: ' + node.id);
          response.end();
          return callback(null, true);
        }

        var stream = send(request, realpath);

        stream.pipe(response);

        stream.on('end', function() {
          callback(null, true);
        });
      });
};
