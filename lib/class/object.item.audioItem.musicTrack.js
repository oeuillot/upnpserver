/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var fs = require('fs');
var mm = require('musicmetadata');
var Mime = require('mime');

var AudioItem = require('./object.item.audioItem');
var Item = require('./object.item');
var Res = require('./object.res');
var logger = require('../logger');
var id3Parser = require('../id3Parser');

var MusicTrack = function() {
};

Util.inherits(MusicTrack, AudioItem);

module.exports = MusicTrack;

MusicTrack.ParentClass = AudioItem;
MusicTrack.UPNP_CLASS = MusicTrack.ParentClass.UPNP_CLASS + ".musicTrack";

MusicTrack.prototype.init = function(parent, name, upnpClass, container,
    attributes, callback) {
  var self = this;

  Res.prototype.init.call(this, parent, name, upnpClass, container, attributes,
      function(error, name, attributes) {
        if (error) {
          return callback(error);
        }

        if (attributes.id3) {
          return callback(null, name, attributes);
        }
        attributes.id3 = true;

        id3Parser.parse(attributes, attributes.realPath, function(error,
            attributes) {

          return callback(null, name, attributes);
        });
      });
};

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
      Item._getNode(xml, "res")._attrs.duration = ((d > 9)
          ? d : ("0" + d)) + ":" + ((mm > 9)
          ? mm : ("0" + mm)) + ":" + ((ss > 9)
          ? ss : ("0" + ss)) + ".000";
    }

    if (attributes.originalTrackNumber) {
      content.push({
        _name : "upnp:originalTrackNumber",
        _content : attributes.originalTrackNumber
      });
    }

    if (attributes.id3pictures) {
      var pictureId = 0;
      attributes.id3pictures.forEach(function(pictureFormat) {
        if (pictureFormat === "jpg") {

          var aau = {
            _name : "upnp:albumArtURI",
            _content : request.contentURL + item.id + "?id3picture=" +
                pictureId
          };

          if (request.dlnaSupport) {
            aau._attrs = {
              "dlna:profileID" : "JPEG_TN",
              "xmlns:dlna" : "urn:schemas-dlna-org:metadata-1-0/"
            };
          }

          content.push(aau);
        }
        // <upnp:albumArtURI dlna:profileID="JPEG_TN"
        // xmlns:dlna="urn:schemas-dlnaorg:metadata-1-0/">http://10.166.15.10:41593/upnpdb/art/ed9f1485-cb92e24a-4d9f1ae4-a461e9c8.jpg</upnp:albumArtURI>
        pictureId++;
      });
    }

    return callback(null, xml);
  });
};

MusicTrack.prototype.processRequest = function(item, request, response, path,
    parameters, callback) {

  if (parameters && parameters.id3picture) {
    return this.processID3PictureRequest(item, request, response, path,
        parameters, callback);
  }

  return Res.prototype.processRequest.call(this, item, request, response, path,
      parameters, callback);
};

MusicTrack.prototype.processID3PictureRequest = function(item, request,
    response, path, parameters, callback) {

  var id3pictureIndex = parseInt(parameters.id3picture, 10);
  if (id3pictureIndex < 0) {
    return callback("Invalid id3picture parameter", true);
  }

  // console.log("Get stream of " + item.attributes.realPath);

  id3Parser.getPicture(item.attributes.realPath, id3pictureIndex, function(
      error, picture) {

    if (!picture.format || !picture.data) {
      return callback('Invalid picture for item ' + item.id + " #id3=" +
          id3pictureIndex, true);
    }

    response.setHeader("Content-Type", Mime.lookup(picture.format));
    response.setHeader("Content-Size", picture.data.length);
    response.end(picture.data);

    return callback(null, true);

  });
};
