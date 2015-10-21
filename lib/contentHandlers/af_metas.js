/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Path = require("path");
var fs = require("fs");
var Util = require('util');

var debug = require('debug')('upnpserver:af_metas');

var Abstract_Metas = require('./abstract_metas');

var Movie = require('../class/object.item.videoItem.movie');
var VideoAlbum = require('../class/object.container.album.videoAlbum');

var AC_JSON = "a" + "l" + "l" + "o" + "c" + "i" + "n" + "e" + ".json";
var POSTER = "poster.jpg";
var TRAILER = "trailer.mp4";

var MOVIE_KEY_REGEXP = /.*__AF([a-z0-9]+)\.[^.]*$/i;
var MOVIE_ALBUM_KEY_REGEXP = /.*__AS([a-z0-9]+)\.[^.]*$/i;

var AF_Metas = function(configuration) {
  Abstract_Metas.call(this, configuration);

  configuration = configuration || {};

  this.configuration = configuration;

  this.basePath = configuration.basePath || process.env.AF_METAS_PATH;

  if (debug.enabled) {
    debug("AF_METAS: BASE path=" + this.basePath);
  }
};

Util.inherits(AF_Metas, Abstract_Metas);

module.exports = AF_Metas;

AF_Metas.prototype.getTrailerPath = function(node, key) {
  return Path.join(this.basePath, key, TRAILER);
};

AF_Metas.prototype.getPosterPath = function(node, key) {
  return Path.join(this.basePath, key, POSTER);
};

AF_Metas.prototype.prepareNode = function(node, callback) {
  if (!this.basePath) {
    return callback();
  }

  var contentURL = node.attributes.contentURL;
  if (!contentURL) {
    return callback();
  }

  var reg = MOVIE_KEY_REGEXP.exec(contentURL);

  if (debug.enabled) {
    debug("Prepare node of '" + contentURL + "' => " + reg);
  }

  if (!reg) {
    return callback();
  }

  var afKey = reg[1];

  var path = Path.join(this.basePath, afKey);

  var self = this;

  fs.stat(path, function(error, stats) {
    if (error) {
      debug("prepareNode: Unknown KEY " + afKey);
      return callback();
    }
    if (!stats.isDirectory()) {
      debug("Not a directory ! " + path);
      return callback();
    }

    self.loadJSON(node, afKey, path, function(error) {
      if (error) {
        debug("Can not load JSON of key '" + afKey + "'", error);
      }

      self.refPoster(node, afKey, function(error) {
        if (error) {
          debug("Can not ref Poster of key '" + afKey + "'", error);
        }

        self.refTrailer(node, afKey, function(error) {
          if (error) {
            debug("Can not ref Trailer of key '" + afKey + "'", error);
          }

          setImmediate(callback);
        });
      });
    });
  });
};

AF_Metas.prototype.loadJSON = function(node, afKey, path, callback) {
  var jsonPath = Path.join(path, AC_JSON);

  if (debug.enabled) {
    debug("Load json '" + jsonPath + "'");
  }

  fs.readFile(jsonPath, function(error, content) {

    if (error) {
      return callback(error);
    }

    var j;
    try {
      j = JSON.parse(content);
    } catch (x) {
      debug("Can not parse JSON ", x);
      return callback("Can not parse JSON");
    }

    if (false && debug.enabled) {
      debug("JSON=", j);
    }

    var movie = j.movie;
    if (!movie) {
      return callback();
    }

    var attributes = node.attributes;

    if (movie.title) {
      attributes.title = movie.title;
      attributes.titleAlsoKnownAs = movie.title;
    }
    if (movie.originalTitle) {
      attributes.originalTitle = movie.originalTitle;
    }
    if (movie.region) {
      attributes.region = movie.nationality;
    }
    if (movie.productionYear) {
      attributes.year = movie.productionYear;
    }
    if (movie.releaseDate) {
      var ds = /([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(movie.releaseDate);
      if (ds) {
        attributes.releaseDate = (new Date(parseInt(ds[1], 10), parseInt(ds[2],
            10) - 1, parseInt(ds[3]))).getTime();
      }
    }
    if (movie.synopsisShort) {
      attributes.description = movie.synopsis.replace(/<br \/>/gi, ' ');
    }
    if (movie.synopsis) {
      attributes.longDescription = movie.synopsis.replace(/<br \/>/gi, ' ');

      if (!attributes.description) {
        attributes.description = attributes.longDescription;
        delete attributes.longDescription;
      }
    }
    if (movie.movieType) {
      attributes.type = movie.movieType.$;
    }

    var castMembers = movie.castMember;
    if (castMembers) {
      castMembers.forEach(function(c) {
        switch (c.activity.code) {

        case 8001:
          attributes.actors = attributes.actors || [];
          attributes.actors.push({
            key : c.person.code,
            name : c.person.name,
            role : c.role
          });
          break;

        case 8002:
          attributes.directors = attributes.directors || [];
          attributes.directors.push({
            key : c.person.code,
            name : c.person.name
          });
          break;

        case 8003:
        case 8004:
          attributes.authors = attributes.authors || [];
          attributes.authors.push({
            key : c.person.code,
            name : c.person.name,
            role : c.activity.name
          });
          break;

        /*
         * No too many data in XML default: attributes.artists = attributes.artists || []; attributes.artists.push({ key :
         * c.person.code, name : c.person.name, role : c.activity.name }); break;
         */
        }
      });
    }
    var genres = movie.genre;
    if (genres) {
      attributes.genres = attributes.genres || [];

      genres.forEach(function(genre) {
        attributes.genres.push({
          id : "af_key" + genre.code,
          name : genre.$
        });
      });
    }

    var statistics = movie.statistics;
    if (statistics) {
      attributes.ratings = attributes.ratings || [];

      if (statistics.pressRating) {
        attributes.ratings.push({
          type : "af_press",
          rating : statistics.pressRating
        });
      }

      if (statistics.userRating) {
        attributes.ratings.push({
          type : "af_user",
          rating : statistics.userRating
        });
      }
    }

    var movieCertificate = movie.movieCertificate;
    if (movieCertificate) {
      var cert = movieCertificate.certificate;
      var certificate;
      if (cert && cert.code) {
        switch (cert.code) {
        case 14001:
        case 14044:
          certificate = "-12";
          break;
        case 14002:
          certificate = "-16";
          break;
        case 14004:
          certificate = "-18";
          break;
        case 14005:
          certificate = "X";
          break;
        case 14029:
          certificate = "3+";
          break;
        case 14031:
          certificate = "-10";
          break;
        }
      }

      if (certificate) {
        attributes.certificate = certificate;
      }
    }

    callback();
  });
};

AF_Metas.prototype.searchUpnpClass = function(fileInfos) {
  var contentURL = fileInfos.contentURL;

  var reg = MOVIE_KEY_REGEXP.exec(contentURL);
  if (reg) {
    return {
      upnpClass : this.contentDirectoryService.upnpClasses[Movie.UPNP_CLASS],
      priority : 30
    };
  }

  reg = MOVIE_ALBUM_KEY_REGEXP.exec(contentURL);
  if (reg) {
    return {
      upnpClass : this.contentDirectoryService.upnpClasses[VideoAlbum.UPNP_CLASS],
      priority : 30
    };
  }

  return null;
};
