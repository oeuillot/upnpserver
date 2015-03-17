/*jslint node: true, nomen: true */
"use strict";

var mm = require('musicmetadata');
var fs = require('fs');

var logger = require('./logger');

var id3Parser = function(attributes, path, callback) {
  var stream;
  try {
    stream = fs.createReadStream(path);

  } catch (x) {
    logger.error("Can not access to " + path, x);

    return callback(x);
  }

  attributes = attributes || {};

  mm(stream, function(error, tags) {
    try {
      stream.destroy();
    } catch (x) {
      logger.error("Can not close stream", x);
    }

    if (error) {
      logger.error("Can not parse ID3 tags of path=", path, " error=", error);
      return callback(null, attributes);
    }

    if (!tags) {
      logger.error("No id3 tags for " + path);
      return callback(null, attributes);
    }

    attributes.artists = tags.artist;
    attributes.genres = tags.genre;
    attributes.album = tags.album;
    attributes.year = tags.year && parseInt(tags.year, 10);
    attributes.duration = tags.duration;
    attributes.originalTrackNumber = tags.track &&
        typeof (tags.track.no) === "number" && tags.track.no;
    if (tags.picture) {
      attributes.id3pictures = [];
      tags.picture.forEach(function(picture) {
        attributes.id3pictures.push(picture.format);
      });
    }

    return callback(null, attributes);
  });
};

function getPicture(path, pictureIndex, callback) {

  var stream = fs.createReadStream(path);
  mm(stream, function(error, tags) {
    try {
      stream.destroy();
    } catch (x) {
      logger.error("Can not close stream", x);
    }

    if (error) {
      logger.error("Can not parse ID3 of " + path, error);
      return callback("Can not parse ID3");
    }

    if (!tags || !tags.picture || tags.picture.length <= pictureIndex) {
      return callback('Picture #' + pictureIndex + "' not found");
    }

    var picture = tags.picture[pictureIndex];

    return callback(null, picture);
  });
}

module.exports = {
  parse : id3Parser,
  getPicture : getPicture
};
