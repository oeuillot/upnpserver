/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Path = require("path");
var fs = require("fs");
var Util = require('util');
var Mime = require('mime');
var send = require('send');

var debug = require('debug')('upnpserver:af_metas');

var ContentHandler = require('./contentHandler');

var AC_JSON = "a" + "l" + "l" + "o" + "c" + "i" + "n" + "e" + ".json";
var POSTER = "poster.jpg";
var TRAILER = "trailer.mp4";

var KEY_REGEXP = /.*__AF([a-z0-9]+)\.[^.]*$/i;
var REQUEST_REGEXP = /^([^:]+):(.+)$/i;

var AF_Metas = function(configuration) {
  ContentHandler.call(this, configuration);

  configuration = configuration || {};

  this.configuration = configuration;

  this.basePath = configuration.basePath || process.env.AF_METAS_PATH;

  if (debug.enabled) {
    debug("AF_METAS: BASE path=" + this.basePath);
  }
};

Util.inherits(AF_Metas, ContentHandler);

module.exports = AF_Metas;

AF_Metas.prototype.prepareNode = function(node, callback) {
  if (!this.basePath) {
    return callback();
  }

  var contentURL = node.attributes.contentURL;
  if (!contentURL) {
    return callback();
  }

  var reg = KEY_REGEXP.exec(contentURL);

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
      debug.log("prepareNode: Unknown KEY " + afKey);
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

      self.refPoster(node, afKey, path, function(error) {
        if (error) {
          debug("Can not ref Poster of key '" + afKey + "'", error);
        }

        self.refTrailer(node, afKey, path, function(error) {
          if (error) {
            debug("Can not ref Trailer of key '" + afKey + "'", error);
          }

          setImmediate(callback);
        });
      });
    });
  });
};

AF_Metas.prototype.refTrailer = function(node, afKey, path, callback) {

  var self = this;

  var trailerPath = Path.join(path, TRAILER);

  fs.stat(trailerPath, function(error, stats) {
    if (debug.enabled) {
      debug("Trailer '" + trailerPath + "' => " + ((error) ? error : "FOUND"));
    }
    if (error) {
      return callback(error);
    }

    var res = node.attributes.res || [];
    node.attributes.res = res;

    var mimeType = Mime.lookup(TRAILER);

    res.push({
      contentHandlerKey : self.key,
      mimeType : mimeType,
      key : "trailer:" + afKey,
      size : stats.size,
      additionalInfo : "type=trailer"
    });

    callback();
  });
};

AF_Metas.prototype.refPoster = function(node, afKey, path, callback) {

  var self = this;

  var posterPath = Path.join(path, POSTER);

  fs.stat(posterPath, function(error, stats) {
    if (debug.enabled) {
      debug("Poster '" + posterPath + "' => " + ((error) ? error : "FOUND"));
    }

    if (error) {
      return callback(error);
    }

    var res = node.attributes.res || [];
    node.attributes.res = res;

    var mimeType = Mime.lookup(posterPath);

    res.push({
      contentHandlerKey : self.key,
      mimeType : mimeType,
      size : stats.size,
      key : "poster:" + afKey,
      additionalInfo : "type=poster"
    });

    callback();
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
    }
    if (movie.originalTitle) {
      attributes.originalTitle = movie.originalTitle;
    }
    if (movie.productionYear) {
      attributes.year = movie.productionYear;
    }
    if (movie.synopsis) {
      attributes.subject = movie.synopsis.replace(/<br \/>/gi, ' ');
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

        default:
          attributes.artists = attributes.artists || [];
          attributes.artists.push({
            key : c.person.code,
            name : c.person.name,
            role : c.activity.name
          });
          break;
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

    callback();
  });
};

AF_Metas.prototype.processRequest = function(node, request, response, path,
    parameters, callback) {

  var ret = REQUEST_REGEXP.exec(parameters.resKey);

  if (debug.enabled) {
    debug("Parse Key '" + parameters.resKey + "' => " + ret);
  }
  if (!ret) {
    return callback("Invalid key parameter (" + parameters.resKey + ")", true);
  }

  var basePath = Path.join(this.basePath, ret[2]);
  var resourcePath;

  if (ret[1] === "poster") {
    resourcePath = Path.join(basePath, POSTER);

  } else if (ret[1] === "trailer") {
    resourcePath = Path.join(basePath, TRAILER);
  }

  if (!resourcePath) {
    return callback("Invalid key '" + parameters.key + "'", true);
  }

  fs.exists(resourcePath, function(exists) {
    if (!exists) {
      console.error("Not exist '" + resourcePath + "'");
      return callback("Invalid path '" + resourcePath + "'", true);
    }
    if (debug.enabled) {
      debug("Send '" + resourcePath + "'");
    }

    var stream = send(request, resourcePath);
    stream.pipe(response);

    stream.on('end', function() {
      callback(null, true);
    });
  });
};
