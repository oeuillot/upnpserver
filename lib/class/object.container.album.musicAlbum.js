/*jslint node: true, esversion: 6 */
"use strict";

const Item = require('./object.item');
const Album = require('./object.container.album');
const ImageItem = require('./object.item.imageItem');
const Xmlns = require('../xmlns');

const logger = require('../logger');

const MAX_ALBUM_ARTS = 8;

const MERGE_CHILD_ARTISTS = false;

const MAX_ARTISTS = 4;

const _UPNP_CLASS=Album.UPNP_CLASS + ".musicAlbum";

class MusicAlbum extends Album {
  get name() { return MusicAlbum.UPNP_CLASS; }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  toJXML(node, attributes, request,
      filterCallback, callback) {

    super.toJXML(node, attributes, request, filterCallback,
        (error, xml) => {
          if (error) {
            return callback(error);
          }

          if (!filterCallback(Xmlns.UPNP_METADATA, "artist") &&
              !filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
            return callback(null, xml);
          }

          var getArtists=filterCallback(Xmlns.UPNP_METADATA, "artist");


          node.listChildren({
            resolveLinks : true

          }, (error, list) => {
            if (error) {
              logger.error("Can not list children");
              return callback(null, xml);
            }

            var count = 0;
            var artHash={};
            var artists = {};
            var artistsList = [];

            list.forEach((child) => {
              var childAttributes = child.attributes;

              if (!childAttributes) {
                return;
              }

              if (getArtists) {
                if (MERGE_CHILD_ARTISTS && childAttributes.artists) {
                  childAttributes.artists.find((artist) => {
                    if (artistsList.length>MAX_ARTISTS) {
                      return true;
                    }

                    if (!artist || artists[artist.name || artist]) {
                      return false;
                    }

                    artists[artist.name || artist] = true;
                    artistsList.push(artist);
                  });
                }
              }

              if (filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
                if (!MAX_ALBUM_ARTS || count < MAX_ALBUM_ARTS) {
                  var albumArts = childAttributes.albumArts;
                  if (albumArts) {
                    albumArts.find((albumArtInfo) => {
                      if (MAX_ALBUM_ARTS > 0 && count > MAX_ALBUM_ARTS) {
                        return true;
                      }

                      if (ImageItem.isMimeTypeImage(albumArtInfo.mimeType)) {                         
                        if (albumArtInfo.hash) {
                          if (artHash[albumArtInfo.hash]) {
                            return false;
                          }
                          artHash[albumArtInfo.hash]=true;
                        }

                        var aau = {
                            _name : "upnp:albumArtURI",
                            _content : request.contentURL + child.id +
                            "/" + albumArtInfo.contentHandlerKey + "/" + albumArtInfo.key
                        };

                        if (request.dlnaSupport) {
                          var dlna = albumArtInfo.dlnaProfile ||
                          ImageItem.getDLNA(albumArtInfo.mimeType);
                          if (dlna) {
                            aau._attrs = {
                                "dlna:profileID" : dlna
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

            if (getArtists) {
              Item.addList(xml._content, artistsList.length, "upnp:artist", true);
            }

            callback(null, xml);
          });
        });
  }  
}

module.exports=MusicAlbum;
