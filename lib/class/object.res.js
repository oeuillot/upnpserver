/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var Mime = require('mime');
var send = require('send');
var assert = require('assert');
var fs = require('fs');
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

    var realPath = attributes.realPath;
    if (!realPath) {
      return self._processContentHandlers(node, callback);
    }

    if (attributes.mime === undefined) {
      attributes.mime = Mime.lookup(realPath, "");
    }

    if (attributes.date && attributes.size) {
      return self._processContentHandlers(node, callback);
    }

    fs.stat(realPath, function(error, stats) {
      if (error) {
        return callback(error);
      }

      if (!node.service.upnpServer.configuration.strict && !attributes.size) {
        attributes.size = stats.size;
      }

      if (!attributes.date) {
        var t = stats.mtime;
        if (t) {
          if (t.getFullYear() >= 1970) {
            attributes.date = t.getTime();
          } else {
            attributes.date = t;
          }
        }
      }

      return self._processContentHandlers(node, callback);
    });
  });
};

Res.prototype._listContentHandlers = function(node) {

  var mime = node.attributes.mime;
  if (!mime) {
    return null;
  }

  var contentHandlersByMimeType = node.service.contentHandlersByMimeType;

  // console.log("Content handlers", contentHandlersByMimeType);

  var c1 = contentHandlersByMimeType[mime];
  if (c1) {
    return c1;
  }

  var mime1 = mime.split("/")[0] + "/*";
  var c2 = contentHandlersByMimeType[mime1];

  // console.log("Mime " + mime1 + " => ", c2);
  return c2;
};

Res.prototype._processContentHandlers = function(node, callback) {

  var cs = this._listContentHandlers(node);

  // console.log("Content for '" + mime + "' => ", cs);

  if (!cs) {
    return callback();
  }

  async.eachSeries(cs, function(contentHandler, callback) {
    contentHandler.prepareNode(node, callback);

  }, callback);
};

Res.prototype.toJXML = function(node, request, callback) {

  var self = this;

  return Item.prototype.toJXML.call(this, node, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    var attributes = node.attributes;

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

    if (attributes.realPath) {
      var mimeType = attributes.mime || Mime.lookup(attributes.realPath);

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

    var cs = self._listContentHandlers(node);
    if (!cs) {
      return callback(null, xml);
    }

    async.eachSeries(cs, function(contentHandler, callback) {
      if (!contentHandler.toJXML) {
        return callback();
      }

      contentHandler.toJXML(node, request, xml, callback);

    }, function(error) {
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

        var realpath = node.attributes.realPath;

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
