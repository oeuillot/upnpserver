/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var AudioItem = require('./object.item.audioItem');
var Item = require('./object.item');

var MUSICMETADATA_XMLNS = "urn:schemas-jasmin-upnp.net:musicmetadata/";

var MUSICMEDATA_LIST = [ 'mm:trackOf', 'mm:diskNo', 'mm:diskOf' ];

var MusicTrack = function() {
  AudioItem.call(this);
};

Util.inherits(MusicTrack, AudioItem);

module.exports = MusicTrack;

MusicTrack.UPNP_CLASS = AudioItem.UPNP_CLASS + ".musicTrack";
MusicTrack.prototype.name = MusicTrack.UPNP_CLASS;

MusicTrack.prototype.mimeTypes = [ 'audio/*' ];

MusicTrack.prototype.toJXML = function(node, attributes, request, callback) {

  var self = this;

  AudioItem.prototype.toJXML.call(this, node, attributes, request, function(
      error, xml) {
    if (error) {
      return callback(error);
    }

    var content = xml._content;

    if (attributes.album) {
      content.push({
        _name : "upnp:album",
        _content : attributes.album
      });
    }

    if (attributes.originalTrackNumber) {
      content.push({
        _name : "upnp:originalTrackNumber",
        _content : attributes.originalTrackNumber
      });
    }

    if (request.contentDirectoryServer.jasminMusicMetadatasExtension) {
      MUSICMEDATA_LIST.forEach(function(name) {
        var value = attributes[name];
        if (value === undefined) {
          return;
        }

        Item.addNamespaceURI(xml, "mm", MUSICMETADATA_XMLNS);

        var x = {
          _name : name,
          _content : value
        };

        content.push(x);
      });
    }

    return callback(null, xml);
  });
};
