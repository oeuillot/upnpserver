/*jslint node: true, esversion: 6 */
"use strict";

const AudioItem = require('./object.item.audioItem');
const Item = require('./object.item');
const Xmlns = require('../xmlns');

const MUSICMEDATA_LIST = [ 'trackOf', 'diskNo', 'diskOf' ];

const _UPNP_CLASS = AudioItem.UPNP_CLASS + ".musicTrack";

class MusicTrack extends AudioItem {
  get name() { return MusicTrack.UPNP_CLASS; }

  get mimeTypes() { return [ 'audio/*' ]; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  toJXML(node, attributes, request, filterCallback, callback) {

    super.toJXML(node, attributes, request, filterCallback, (error, xml) => {
      if (error) {
        return callback(error);
      }

      var content = xml._content;

      if (filterCallback(Xmlns.UPNP_METADATA, "album")) {
        if (attributes.album) {
          content.push({
            _name : "upnp:album",
            _content : attributes.album
          });
        }
      }

      if (filterCallback(Xmlns.UPNP_METADATA, "originalTrackNumber")) {
        if (typeof(attributes.originalTrackNumber)==="number") {
          content.push({
            _name : "upnp:originalTrackNumber",
            _content : attributes.originalTrackNumber
          });
        }
      }

      if (filterCallback(Xmlns.UPNP_METADATA, "originalDiscNumber")) {
        if (typeof(attributes.originalDiscNumber)==="number") {
          content.push({
            _name : "upnp:originalDiscNumber",
            _content : attributes.originalDiscNumber
          });
        }
      }

      if (request.jasminMusicMetadatasSupport) {
        MUSICMEDATA_LIST.forEach((name) => {
          var value = attributes[name];
          if (value === undefined) {
            return;
          }

          if (!filterCallback(Xmlns.JASMIN_MUSICMETADATA, name)) {
            return;
          }

          var x = {
              _name : "mm:" + name,
              _content : value
          };

          content.push(x);
        });
      }

      callback(null, xml);
    });
  }
}

module.exports = MusicTrack;
