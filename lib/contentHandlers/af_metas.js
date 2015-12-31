/*jslint node: true, esversion: 6 */
"use strict";

const Path = require("path");
const fs = require("fs");

const debug = require('debug')('upnpserver:af_metas');

const Abstract_Metas = require('./abstract_metas');

const Movie = require('../class/object.item.videoItem.movie');
const VideoAlbum = require('../class/object.container.album.videoAlbum');

const AC_JSON = "a" + "l" + "l" + "o" + "c" + "i" + "n" + "e" + ".json";
const POSTER = "poster.jpg";
const TRAILER = "trailer.mp4";

const MOVIE_KEY_REGEXP = /.*__AF([a-z0-9]+)\.[^.]*$/i;
const MOVIE_ALBUM_KEY_REGEXP = /.*__AS([a-z0-9]+)\.[^.]*$/i;

class AF_Metas extends Abstract_Metas {
  constructor(configuration) {
    super();
    configuration = configuration || {};

    this.configuration = configuration;

    this.basePath = configuration.basePath || process.env.AF_METAS_PATH;

    if (debug.enabled) {
      debug("AF_METAS: BASE path=" + this.basePath);
    }
  }

  getTrailerPath(node, key) {
    return Path.join(this.basePath, key, TRAILER);
  }

  getPosterPath(node, key) {
    return Path.join(this.basePath, key, POSTER);
  }

  prepareNode(node, callback) {
    if (!this.basePath) {
      return callback();
    }

    var contentURL = node.attributes.contentURL;
    if (!contentURL) {
      return callback();
    }

    var reg = MOVIE_KEY_REGEXP.exec(contentURL);

    debug("Prepare node of", contentURL, "=>", reg);

    if (!reg) {
      return callback();
    }

    var afKey = reg[1];

    var path = Path.join(this.basePath, afKey);

    fs.stat(path, (error, stats) => {
      if (error) {
        debug("prepareNode: Unknown KEY", afKey);
        console.error(error);
        return callback();
      }
      if (!stats.isDirectory()) {
        console.error(error);
        debug("Not a directory !", path);
        return callback();
      }

      this.loadJSON(node, afKey, path, (error) => {
        if (error) {
          console.error(error);
          debug("Can not load JSON of key", afKey, error);

        } else {
          debug("JSON of key", afKey, "is loaded");
        }

        this.refPoster(node, afKey, (error) => {
          if (error) {
            console.error(error);
            debug("Can not ref Poster of key", afKey, error);

          } else {
            debug("Ref Poster of key", afKey, "detected");
          }

          this.refTrailer(node, afKey, (error) => {
            if (error) {
              console.error(error);
              debug("Can not ref Trailer of key", afKey, error);

            } else {
              debug("Trailer of key", afKey, "detected");
            }

            setImmediate(callback);
          });
        });
      });
    });
  }

  loadJSON(node, afKey, path, callback) {
    var jsonPath = Path.join(path, AC_JSON);

    if (debug.enabled) {
      debug("Load json '" + jsonPath + "'");
    }

    fs.readFile(jsonPath, (error, content) => {

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

      function normalizeText(text) {
        if (!text) {
          return text;
        }

        text = text.replace(/<br\W*\/?>/gi, '\n');

        return text.replace(/<(?:.|\n)*?>/gm, '');
      }

      if (movie.synopsisShort) {
        attributes.description = normalizeText(movie.synopsisShort);
      }
      if (movie.synopsis) {
        attributes.longDescription = normalizeText(movie.synopsis);

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
        castMembers.forEach((c) => {
          switch (c.activity.code) {

          case 8001:
            attributes.actors = attributes.actors || [];
            attributes.actors.push({
              key : c.person.code,
              name : normalizeText(c.person.name),
              role : normalizeText(c.role)
            });
            break;

          case 8002:
            attributes.directors = attributes.directors || [];
            attributes.directors.push({
              key : c.person.code,
              name : normalizeText(c.person.name)
            });
            break;

          case 8003:
          case 8004:
            attributes.authors = attributes.authors || [];
            attributes.authors.push({
              key : c.person.code,
              name : normalizeText(c.person.name),
              role : normalizeText(c.activity.name)
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

        genres.forEach((genre) => {
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
          case 14045:
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
          case 14030:
            certificate = "6+";
            break;
          case 14031:
            certificate = "-10";
            break;
          case 14035:
            certificate = "!"; // Avertissement : des scènes, des propos ou des images peuvent heurter la sensibilité des
            // spectateurs
            break;
          }
        }

        if (certificate) {
          attributes.certificate = certificate;
        }
      }

      callback();
    });
  }

  searchUpnpClass(fileInfos) {
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
  }
}

module.exports = AF_Metas;
