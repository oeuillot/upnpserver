/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var fs = require('fs');

var AudioItem = require('./object.item.audioItem');
var Item = require('./object.item');
var Res = require('./object.res');
var logger = require('../logger');

var MusicTrack = function() {
};

Util.inherits(MusicTrack, AudioItem);

module.exports = MusicTrack;

MusicTrack.UPNP_CLASS = AudioItem.UPNP_CLASS + ".musicTrack";
MusicTrack.prototype.name = MusicTrack.UPNP_CLASS;

MusicTrack.prototype.mimeTypes = [ 'audio/*' ];

MusicTrack.prototype.toJXML = function(item, request, callback) {

  var self = this;

  Res.prototype.toJXML.call(this, item, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    var attributes = item.attributes;
    var content = xml._content;

    if (attributes.artist) {
      attributes.artist.forEach(function(artist) {
        if (!artist) {
          return;
        }

        content.push({
          _name : "upnp:artist",
          _content : artist
        });
      });
    }

    if (attributes.genre) {
      attributes.genre.forEach(function(genre) {
        if (!genre) {
          return;
        }

        content.push({
          _name : "upnp:genre",
          _content : genre
        });
      });
    }

    if (attributes.album) {
      content.push({
        _name : "upnp:album",
        _content : attributes.album
      });
    }

    if (attributes.year) {
      Item._getNode(xml, "dc:date")._content = Item.toISODate(new Date(Date
          .UTC(attributes.year, 0)));
    }

    if (attributes.duration) {
      var d = attributes.duration;
      var ss = d % 60;
      d = (d - ss) / 60;
      var mm = d % 60;
      d = (d - mm) / 60;
      Item._getNode(xml, "res")._attrs.duration = ((d > 9) ? d : ("0" + d)) +
          ":" + ((mm > 9) ? mm : ("0" + mm)) + ":" +
          ((ss > 9) ? ss : ("0" + ss)) + ".000";
    }

    if (attributes.originalTrackNumber) {
      content.push({
        _name : "upnp:originalTrackNumber",
        _content : attributes.originalTrackNumber
      });
    }

    return callback(null, xml);
  });
};
