/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Album = require('./object.container.album');
var Res = require('./object.res');
var ImageItem = require('./object.item.imageItem');
var Xmlns = require('../xmlns');

var logger = require('../logger');

var MAX_ALBUM_ARTS = 4;

var MusicAlbum = function() {
  Album.call(this);
};

Util.inherits(MusicAlbum, Album);

module.exports = MusicAlbum;

MusicAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".musicAlbum";
MusicAlbum.prototype.name = MusicAlbum.UPNP_CLASS;

MusicAlbum.prototype.toJXML = function(node, attributes, request,
    filterCallback, callback) {

  var self = this;

  Album.prototype.toJXML.call(this, node, attributes, request, filterCallback,
      function(error, xml) {
        if (error) {
          return callback(error);
        }

        if (!filterCallback(Xmlns.UPNP_METADATA, "artist") &&
            !filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
          return callback(null, xml);
        }

        node.listChildren({
          resolveLinks : true

        },
            function(error, list) {
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

                if (filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
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
                                "?contentHandler=" +
                                albumArtInfo.contentHandlerKey +
                                "&albumArtKey=" + albumArtInfo.key
                          };

                          if (request.dlnaSupport) {
                            var dlna = albumArtInfo.dlnaProfile ||
                                ImageItem.getDLNA(albumArtInfo.mimeType);
                            if (dlna) {
                              aau._attrs = {
                                "dlna:profileID" : dlna,
                                "xmlns:dlna" : Xmlns.DLNA_METADATA
                              };
                            }
                          }

                          xml._content.push(aau);

                          count++;
                        }
                      });
                    }
                  }
                }
              });

              if (filterCallback(Xmlns.UPNP_METADATA, "artist")) {
                Item.addList(xml._content, artistsList.length, "upnp:artist",
                    true);
              }

              return callback(null, xml);
            });
      });
};
