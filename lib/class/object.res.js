/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var Mime = require('mime');
var send = require('send');
var assert = require('assert');
var async = require('async');

var Item = require('./object.item');

var Res = function() {
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

              if (!attributes.date) {
                var t = stats.mtime;
                if (t) {
                  if (t.getFullYear() >= 1970) {
                    attributes.mtime = t.getTime();
                  } else {
                    attributes.mtime = t;
                  }
                }
              }

              callback(null, node);
            });
  });
};

Res.prototype.toJXML = function(node, attributes, request, callback) {

  var self = this;

  return Item.prototype.toJXML.call(this, node, attributes, request, function(
      error, xml) {
    if (error) {
      return callback(error);
    }

    if (attributes.albumArts) {
      attributes.albumArts.forEach(function(albumArtInfo) {

        if (albumArtInfo.format === "jpg") {
          var aau = {
            _name : "upnp:albumArtURI",
            _content : request.contentURL + node.id + "?contentHandler=" +
                albumArtInfo.contentHandlerKey + "&albumArtKey=" +
                albumArtInfo.key
          };

          if (request.dlnaSupport) {
            aau._attrs = {
              "dlna:profileID" : (albumArtInfo.dlnaProfile || "JPEG_TN"),
              "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
            };
          }

          xml._content.push(aau);
        }
      });
    }

    if (attributes.contentURL) {
      var mimeType = attributes.mime || Mime.lookup(attributes.contentURL);

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
            "DLNA.ORG_FLAGS=01700000000000000000000000000000" ].join(";");
      }
      var attrs = [ protocol, network, contentFormat, additionalInfo ]
          .join(":");

      var resAttributes = {
        protocolInfo : attrs
      };

      [ 'size', 'duration', 'bitrate', 'sampleFrequency', 'bitsPerSample',
          'nrAudioChannels' ].forEach(function(n) {
        if (attributes[n]) {
          resAttributes[n] = attributes[n];
        }
      });

      xml._content.push({
        _name : "res",
        _attrs : resAttributes,
        _content : request.contentURL + node.id
      });
    }

    if (attributes.res) {
      attributes.res.forEach(function(r) {
        _addRes(xml, r, request, node);
      });
    }

    var dcDate = Item._getNode(xml, "dc:date");
    if (!dcDate._content) {
      var date = attributes.mtime;
      if (date) {
        dcDate._content = Item.toISODate(date);
      }
    }

    node.service.emitToJXML(node, attributes, request, xml, function(error) {
      callback(error, xml);
    });
  });
};

function _addRes(xml, res, request, node) {
  var protocol = "http-get";
  var network = "*";
  var contentFormat = res.mimeType;
  var additionalInfo = "*";

  if (request.dlnaSupport) {
    var pn = res.dlnaProfile;
    if (!pn) {
      pn = "";
    }

    additionalInfo = [ "DLNA.ORG_PN=" + pn,
        "DLNA.ORG_FLAGS=00f00000000000000000000000000000" ].join(";");
  }

  var attrs = [ protocol, network, contentFormat, additionalInfo ].join(":");

  var resAttributes = {
    protocolInfo : attrs
  };

  [ 'size', 'duration', 'bitrate', 'sampleFrequency', 'bitsPerSample',
      'nrAudioChannels' ].forEach(function(n) {
    if (res[n]) {
      resAttributes[n] = res[n];
    }
  });

  xml._content.push({
    _name : "res",
    _attrs : resAttributes,
    _content : request.contentURL + node.id + "?contentHandler=" +
        res.contentHandlerKey + "&resKey=" + res.key
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
