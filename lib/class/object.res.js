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

              if (!node.service.upnpServer.configuration.strict &&
                  !attributes.size) {
                attributes.size = stats.size;
              }

              Repository.fillDates(attributes, stats);

              callback(null, node);
            });
  });
};

function formatDuration(t) {
  var millis = Math.floor(t * 1000) % 1000;
  t = Math.floor(t);

  var seconds = t % 60;
  t = Math.floor(t / 60);

  var minutes = t % 60;
  t = Math.floor(t / 60);

  var hours = t;

  function pad(v, n) {
    var s = "0000" + v;
    return s.slice(-n);
  }

  return hours + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + ":" +
      pad(millis, 3);
}

function format(attributeName, value) {
  if (attributeName === "duration") {
    if (typeof (value) === "number") {
      return formatDuration(value);
    }
  }

  return value;
}

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
            var hashs = {};

            attributes.albumArts.forEach(function(albumArtInfo) {

              if (ImageItem.isMimeTypeImage(albumArtInfo.mimeType)) {
                if (albumArtInfo.hash) {
                  if (hashs[albumArtInfo.hash]) {
                    return;
                  }
                  hashs[albumArtInfo.hash] = true;
                }

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
          var res = attributes.res;
          if (!res && (self.contentURL || self.externalContentURL)) {
            _addRes(xml, [{}], request, node, filterCallback);
          }

          if (res) {
            res.forEach(function(r) {
              _addRes(xml, r, request, node, filterCallback);
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

function _addRes(xml, res, request, node, filterCallback) {
  var attributes = node.attributes;

  var resAttributes = {
    id : res.key || "main"
  };

  if (filterCallback(Xmlns.DIDL_LITE, "res", "protocolInfo")) {
    var protocol = "http-get";
    var network = res.network || "*";
    var contentFormat = res.mimeType;
    if (!contentFormat && !res.key) {
      contentFormat = attributes.mime || Mime.lookup(attributes.contentURL);
    }

    var additionalInfo = res.additionalInfo;

    if (request.dlnaSupport) {
      var pn = res.dlnaProfile;
      if (!pn) {
        pn = ImageItem.getDLNA(contentFormat, res.width, res.height);
      }

      var adds = [];
      if (additionalInfo) {
        adds.push(additionalInfo);
      }

      if (pn) {
        adds.push("DLNA.ORG_PN=" + pn);
      }
      adds.push("DLNA.ORG_FLAGS=00f00000000000000000000000000000");

      additionalInfo = adds.join(";");
    }

    var attrs = [ protocol, network, contentFormat, additionalInfo || "*" ]
        .join(":");

    resAttributes.protocolInfo = attrs;
  }

  RES_PROPERTIES.forEach(function(n) {
    if (!filterCallback(Xmlns.DIDL_LITE, "res", n)) {
      return;
    }

    var val = res[n];
    if (!val) {
      return;
    }

    resAttributes[n] = format(n, val);
  });

  if (!resAttributes.resolution) {
    if (res.width && res.height) {
      resAttributes.resolution = res.width + "x" + res.height;
    }
  }

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

  var contentURL;

  if (!res.key) {
    contentURL = attributes.externalContentURL ||
        (request.contentURL + node.id);

  } else {
    contentURL = request.contentURL + node.id + "?contentHandler=" +
        res.contentHandlerKey + "&resKey=" + res.key;
  }

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
