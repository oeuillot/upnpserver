/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var fs = require('fs');
var mm = require('musicmetadata');

var Album = require('./object.container.album');
var Item = require('./object.item');
var Res = require('./object.res');
var logger = require('../logger');

var MusicAlbum = function() {
};

Util.inherits(MusicAlbum, Album);

module.exports = MusicAlbum;

MusicAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".musicAlbum";

MusicAlbum.prototype.toJXML = function(item, request, callback) {

  var self = this;

  Album.prototype.toJXML.call(this, item, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    var attributes = item.attributes;

    item.listChildren(function(error, list) {
      if (error) {
        logger.error("Can not list children");
        return callback(null, xml);
      }

      list.forEach(function(child) {
        if (!child.attributes) {
          return;
        }

        var pictures = child.attributes.id3pictures;
        if (!pictures) {
          return;
        }

        var pictureId = 0;
        pictures.forEach(function(pictureFormat) {

          if (pictureFormat === "jpg") {
            var aau = {
              _name : "upnp:albumArtURI",
              _content : request.contentURL + child.id + "?id3picture=" +
                  pictureId
            };

            if (request.dlnaSupport) {
              aau._attrs = {
                "dlna:profileID" : "JPEG_TN",
                "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
              };
            }

            xml._content.push(aau);
          }

          pictureId++;
        });

      });

      return callback(null, xml);
    });
  });
};
