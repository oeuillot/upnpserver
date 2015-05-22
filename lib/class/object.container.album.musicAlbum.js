/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Album = require('./object.container.album');
var Res = require('./object.res');
var logger = require('../logger');

var MusicAlbum = function() {
};

Util.inherits(MusicAlbum, Album);

module.exports = MusicAlbum;

MusicAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".musicAlbum";
MusicAlbum.prototype.name = MusicAlbum.UPNP_CLASS;

MusicAlbum.prototype.toJXML = function(node, request, callback) {

  var self = this;

  Album.prototype.toJXML.call(this, node, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    var attributes = node.attributes;

    node.listChildren({
      resolveLinks : true

    }, function(error, list) {
      if (error) {
        logger.error("Can not list children");
        return callback(null, xml);
      }

      list.forEach(function(child) {
        if (!child.attributes) {
          return;
        }

        var albumArts = child.attributes.albumArts;
        if (!albumArts) {
          return;
        }

        albumArts.forEach(function(albumArtInfo) {

          if (albumArtInfo.format === "jpg") {
            var aau = {
              _name : "upnp:albumArtURI",
              _content : request.contentURL + child.id + "?contentHandler=" +
                  albumArtInfo.contentHandlerKey + "&albumArtKey=" +
                  albumArtInfo.key
            };

            if (request.dlnaSupport) {
              aau._attrs = {
                "dlna:profileID" : "JPEG_TN",
                "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
              };
            }

            xml._content.push(aau);
          }
        });
      });

      return callback(null, xml);
    });
  });
};
