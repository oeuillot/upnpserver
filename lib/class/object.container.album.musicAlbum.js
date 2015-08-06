/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Album = require('./object.container.album');
var Res = require('./object.res');
var ImageItem = require('./object.item.imageItem');

var logger = require('../logger');

var MAX_ALBUM_ARTS = 4;

var MusicAlbum = function() {
  Album.call(this);
};

Util.inherits(MusicAlbum, Album);

module.exports = MusicAlbum;

MusicAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".musicAlbum";
MusicAlbum.prototype.name = MusicAlbum.UPNP_CLASS;

MusicAlbum.prototype.toJXML = function(node, attributes, request, callback) {

  var self = this;

  Album.prototype.toJXML.call(this, node, attributes, request, function(error,
      xml) {
    if (error) {
      return callback(error);
    }

    node.listChildren({
      resolveLinks : true

    }, function(error, list) {
      if (error) {
        logger.error("Can not list children");
        return callback(null, xml);
      }

      var count = 0;
      var artists = {};
      var artistsList = [];

      list.forEach(function(child) {
        var childAttributes = child.attributes;

        if (!childAttributes) {
          return;
        }

        if (childAttributes.artists) {
          childAttributes.artists.forEach(function(artist) {
            if (!artist || artists[artist.name || artist]) {
              return;
            }

            artists[artist.name || artist] = true;
            artistsList.push(artist);
          });
        }

        if (!MAX_ALBUM_ARTS || count < MAX_ALBUM_ARTS) {
          var albumArts = childAttributes.albumArts;
          if (albumArts) {
            albumArts.forEach(function(albumArtInfo) {
              if (MAX_ALBUM_ARTS > 0 && count > MAX_ALBUM_ARTS) {
                return;
              }

              if (ImageItem.isMimeTypeImage(albumArtInfo.mimeType)) {
                var aau = {
                  _name : "upnp:albumArtURI",
                  _content : request.contentURL + child.id +
                      "?contentHandler=" + albumArtInfo.contentHandlerKey +
                      "&albumArtKey=" + albumArtInfo.key
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

                xml._content.push(aau);

                count++;
              }
            });
          }
        }
      });

      Item.addList(xml._content, artistsList.length, "upnp:artist", true);

      return callback(null, xml);
    });
  });
};
