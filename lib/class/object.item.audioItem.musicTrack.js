/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var AudioItem = require('./object.item.audioItem');
var Item = require('./object.item');
var Xmlns = require('../xmlns');

var MUSICMEDATA_LIST = [ 'trackOf', 'diskNo', 'diskOf' ];

var MusicTrack = function() {
  AudioItem.call(this);
};

Util.inherits(MusicTrack, AudioItem);

module.exports = MusicTrack;

MusicTrack.UPNP_CLASS = AudioItem.UPNP_CLASS + ".musicTrack";
MusicTrack.prototype.name = MusicTrack.UPNP_CLASS;

MusicTrack.prototype.mimeTypes = [ 'audio/*' ];

MusicTrack.prototype.toJXML = function(node, attributes, request,
    filterCallback, callback) {

  var self = this;

  AudioItem.prototype.toJXML.call(this, node, attributes, request,
      filterCallback, function(error, xml) {
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
          if (attributes.originalTrackNumber) {
            content.push({
              _name : "upnp:originalTrackNumber",
              _content : attributes.originalTrackNumber
            });
          }
        }

        if (request.contentDirectoryService.jasminMusicMetadatasExtension) {
          MUSICMEDATA_LIST.forEach(function(name) {
            var value = attributes[name];
            if (value === undefined) {
              return;
            }

            if (!filterCallback(Xmlns.JASMIN_MUSICMETADATA, name)) {
              return;
            }

            Item.addNamespaceURI(xml, "mm", Xmlns.JASMIN_MUSICMETADATA);

            var x = {
              _name : "mm:" + name,
              _content : value
            };

            content.push(x);
          });
        }

        return callback(null, xml);
      });
};
