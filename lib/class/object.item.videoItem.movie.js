/*jslint node: true */
"use strict";

var Util = require('util');

var VideoItem = require('./object.item.videoItem');
var Xmlns = require('../xmlns');

var Movie = function() {
  VideoItem.call(this);
};

Util.inherits(Movie, VideoItem);

module.exports = Movie;

Movie.UPNP_CLASS = VideoItem.UPNP_CLASS + ".movie";
Movie.prototype.name = Movie.UPNP_CLASS;

Movie.prototype.mimeTypes = [ 'video/mp4', 'video/x-matroska', 'video/x-msvideo' ];

Movie.prototype.toJXML = function(node, attributes, request, filterCallback,
    callback) {

  var self = this;

  VideoItem.prototype.toJXML.call(this, node, attributes, request,
      filterCallback, function(error, xml) {
        if (error) {
          return callback(error);
        }

        var content = xml._content;

        if (filterCallback(Xmlns.UPNP_METADATA, "region")) {
          if (attributes.region) {
            content.push({
              _name : "upnp:region",
              _content : attributes.region
            });
          }
        }

        if (request.jasminMovieMetadatasSupport) {        
          if (filterCallback(Xmlns.JASMIN_MOVIEMETADATA, "releaseDate")) {
            if (attributes.releaseDate) {
              content.push({
                _name : "mo:releaseDate",
                _content : attributes.releaseDate
              });
            }
          }
  
          if (filterCallback(Xmlns.JASMIN_MOVIEMETADATA, "certificate")) {
            if (attributes.certificate) {
              content.push({
                _name : "mo:certificate",
                _content : attributes.certificate
              });
            }
          }
        }
        
        return callback(null, xml);
      });
};
