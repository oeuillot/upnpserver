/*jslint node: true, esversion: 6 */
"use strict";

const VideoItem = require('./object.item.videoItem');
const Xmlns = require('../xmlns');

const _UPNP_CLASS = VideoItem.UPNP_CLASS + ".movie";

class Movie extends VideoItem {
  get name() { return Movie.UPNP_CLASS; }

  get mimeTypes() { return [ 'video/mp4', 'video/x-matroska',
                             'video/x-msvideo' ]; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  toJXML(node, attributes, request, filterCallback,
      callback) {

    super.toJXML(node, attributes, request,
        filterCallback, (error, xml) => {
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
            if (filterCallback(Xmlns.JASMIN_MOVIEMETADATA, "originalTitle")) {
              if (attributes.originalTitle) {
                content.push({
                  _name : "mo:originalTitle",
                  _content : attributes.originalTitle
                });
              }
            }
            if (filterCallback(Xmlns.JASMIN_MOVIEMETADATA, "alsoKnownAs")) {
              if (attributes.titleAlsoKnownAs) {
                content.push({
                  _name : "mo:alsoKnownAs",
                  _content : attributes.titleAlsoKnownAs
                });
              }
            }
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
  }
}

module.exports = Movie;
