/*jslint node: true, esversion: 6 */
"use strict";

const Path = require("path");

const debug = require('debug')('upnpserver:contentHandlers:AbstractMetas');
const logger = require('../logger');

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
    super(configuration);

    this.basePath = this._configuration.basePath || process.env.AF_METAS_PATH;

    debug("AF_METAS: BASE path=" , this.basePath);
  }

  initialize(contentDirectoryService, callback) {

    this.contentProvider = contentDirectoryService.getContentProvider(this.basePath);

    super.initialize(contentDirectoryService, callback);
  }

  /**
   * 
   */
  get name() {
    return "af";
  }

  /**
   * 
   */
  getTrailerPath(contentURL, key) {
    return Path.join(this.basePath, key, TRAILER);
  }

  /**
   * 
   */
  getPosterPath(contentURL, key) {
    return Path.join(this.basePath, key, POSTER);
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {
    if (!this.basePath) {
      return callback();
    }
    
    var contentURL = contentInfos.contentURL;

    var reg = MOVIE_KEY_REGEXP.exec(contentURL);

    debug("Prepare metas of", contentURL, "=>", reg);

    if (!reg) {
      return callback();
    }

    var afKey = reg[1];

    var path = Path.join(this.basePath, afKey);

    this.contentProvider.stat(path, (error, stats) => {
      if (error) {
        logger.error("prepareMetas: Unknown KEY", afKey, error);
        return callback();
      }
      if (!stats.isDirectory()) {
        logger.error("Not a directory !", path, error);
        return callback();
      }

      var metas={};

      this.loadJSON(metas, afKey, path, (error) => {
        if (error) {
          logger.error("Can not load JSON of key", afKey, error);

        } else {
          debug("JSON of key", afKey, "is loaded");
        }

        this.refPoster(metas, contentURL, afKey, (error) => {
          if (error) {
            logger.error("Can not ref Poster of key", afKey, error);

          } else {
            debug("Ref Poster of key", afKey, "detected");
          }

          this.refTrailer(metas, contentURL, afKey, (error) => {
            if (error) {
              logger.error("Can not ref Trailer of key", afKey, error);

            } else {
              debug("Trailer of key", afKey, "detected");
            }

            callback(null, metas);
          });
        });
      });
    });
  }

  /**
   * 
   */
  loadJSON(attributes, afKey, path, callback) {
    var jsonPath = Path.join(path, AC_JSON);

    debug("Load json", jsonPath);

    this.contentProvider.readContent(jsonPath, "utf8", (error, content) => {
      debug("JSON=",content);
      if (error) {
        return callback(error);
      }

      var j;
      try {
        j = JSON.parse(content);
      } catch (x) {
        logger.error("Can not parse JSON ", x);
        return callback("Can not parse JSON");
      }

      if (false && debug.enabled) {
        debug("JSON=", j);
      }

      var movie = j.movie;
      if (!movie) {
        return callback();
      }

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
            let actor={
                key : c.person.code,
                name : normalizeText(c.person.name)
            };
            if (c.role) {
              actor.role=normalizeText(c.role);
            }
            attributes.actors.push(actor);
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

            let author={
                key : c.person.code,
                name : normalizeText(c.person.name)
            };
            if (c.activity.name) {
              author.role=normalizeText(c.activity.name);
            }
            attributes.authors.push(author);
            break;

            /*
             * No too many data in XML default: 
             * attributes.artists = attributes.artists || []; attributes.artists.push({ key :
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
            certificate = "!"; 
            // Avertissement : des scènes, des propos ou des images peuvent heurter la sensibilité des
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

  /**
   * 
   */
  searchUpnpClass(fileInfos) {
    var contentURL = fileInfos.contentURL;

    var reg = MOVIE_KEY_REGEXP.exec(contentURL);
    if (reg) {
      return {
        upnpClass : this.service.upnpClasses[Movie.UPNP_CLASS],
        priority : 30
      };
    }

    reg = MOVIE_ALBUM_KEY_REGEXP.exec(contentURL);
    if (reg) {
      return {
        upnpClass : this.service.upnpClasses[VideoAlbum.UPNP_CLASS],
        priority : 30
      };
    }

    return null;
  }
}

module.exports = AF_Metas;
