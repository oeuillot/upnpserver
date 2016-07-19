/*jslint node: true, esversion: 6, maxlen: 180 */
"use strict";

const assert = require('assert');
const Path = require('path');
const Async = require('async');
const request = require('request');

const debug = require('debug')('upnpserver:contentHandlers:tmdbAPI');
const logger = require('../logger');
const NamedSemaphore = require('../util/namedSemaphore');

const REQUEST_PER_SECOND = 3;
const SIMULATED_REQUEST_COUNT = 4;

const IMAGE_LANGUAGES = "fr,en,null";

class TmdbAPI {
  constructor(apiKey, configuration) {
    this.configuration = configuration;

    try {
      var movieDB = require('moviedb');

      this._movieDB = movieDB(apiKey);

      this._imagesSemaphore = new NamedSemaphore("tmdbImages");

      this._initialize();

    } catch (x) {
      logger.info("Can not use moviedb, please install moviedb npm package");
    }
  }

  _initialize() {

    this._lastRun = Date.now();
    this._remaining = 30;

    var next = (task, callback) => {
      // debug("Process new task");

      var now = Date.now();

      var r = this._remaining + Math.floor((now - this._lastRun) / (1000 / REQUEST_PER_SECOND));
      if (r <= SIMULATED_REQUEST_COUNT) {
        // debug("Wait",400,"ms for next request remaining=",r);

        setTimeout(() => {
          next(task, callback);
        }, (1000 / REQUEST_PER_SECOND));
        return;
      }

      //    console.log("r=",r);

      this._remaining--;
      this._lastRun = Date.now();
      task(callback);
    };

    this.callQueue = Async.queue(next, SIMULATED_REQUEST_COUNT);
  }

  _loadConfiguration(callback) {
    if (this._tmdbConfiguration) {
      return callback(null, this._tmdbConfiguration);
    }

    this._newRequest((callback) => {
      if (this._tmdbConfiguration) {
        return callback();
      }

      this._movieDB.configuration((error, configuration, req) => {
        if (error) {
          return callback(error);
        }
        this._processRequestResponse(req);

        debug("_loadConfiguration", "tmdb configuration loaded !", configuration);

        this._tmdbConfiguration = configuration;
        callback();
      });

    }, () => {
      callback(null, this._tmdbConfiguration);
    });
  }

  _processRequestResponse(response) {
    var remaining = response.headers['x-ratelimit-remaining'];
    if (remaining === undefined) {
      return;
    }

    this._remaining = parseInt(remaining, 10);
    this._lastRun = Date.now();
  }

  _newRequest(func, callback) {
    this.callQueue.push(func, callback);
  }

  searchTvShow(name, years, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    debug("searchTvInfos", "name=", name, "years=", years);

    if (!this._movieDB) {
      return callback();
    }

    this._newRequest((callback) => {

      this._movieDB.searchTv({ query: name }, (error, res, req) => {
        debug("searchTvInfos", "name=", name, "response=", res);
        if (error) {
          return callback(error);
        }
        // console.log(res);
        this._processRequestResponse(req);

        if (res.total_results === 1) {
          callback(null, res.results[0].id);
          return;
        }

        if (res.total_results > 1) {
          var r = res.results.find(
              (r) => (r.name.toLowerCase() === name.toLowerCase() || r.original_name.toLowerCase() === name.toLowerCase()));
          if (r) {
            callback(null, res.results[0].id);
            return;
          }
        }

        callback();
      });
    }, callback);
  }

  loadTvShow(key, previousInfos, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    debug("loadTvShow", "key=", key);

    previousInfos = previousInfos || {};

    var lang = this.configuration.lang || 'fr';

    var ret = {};

    this._newRequest((callback) => {
      var p = { id: key, language: lang };

      if (previousInfos.$timestamp) {
        p.ifModifiedSince = new Date(previousInfos.$timestamp);
      }
      if (previousInfos.$etag && !this.configuration.ignoreETAG) {
        p.ifNoneMatch = previousInfos.$etag;
      }

      this._movieDB.tvInfo(p, (error, infos, req) => {
        if (error) {
          debug("loadTvShow", "error=", error);
          return callback(error);
        }
        this._processRequestResponse(req);

        if (req && req.header.etag) {
          if (previousInfos.$etag === req.header.etag && !this.configuration.ignoreETAG) {
            debug("loadTvShow", "TvInfos has same etag !");

            Object.assign(ret, previousInfos);
            ret.$timestamp = (new Date()).toUTCString();

            return callback();
          }

          ret.$etag = req.header.etag;
        }

        ret.$timestamp = (new Date()).toUTCString();

        if (infos.backdrop_path) {
          delete infos.backdrop_path;
          // tasks.push((callback) => this.copyImage(tvInfo, "backdrop_path", tvPath, callback));
        }
        /*
         * if (infos.created_by) { infos.created_by.forEach((creator) => { if (creator.profile_path) { tasks.push((callback) =>
         * this.copyImage(creator.profile_path, tvPath, callback)); } }); }
         */
        if (infos.poster_path) {
          delete infos.poster_path;
          // tasks.push((callback) => this.copyImage(tvInfo, "poster_path", tvPath, callback));
        }

        Object.assign(ret, infos);

        callback();
      });

    }, (error) => {
      var tasks = [];

      this._newRequest((callback) => {
        var p = {
            id: key,
            language: lang,
            include_image_language: IMAGE_LANGUAGES
        };

        if (previousInfos.$imagesTimestamp) {
          p.ifModifiedSince = new Date(previousInfos.$imagesTimestamp);
        }
        if (previousInfos.$imagesEtag && !this.configuration.ignoreETAG) {
          p.ifNoneMatch = previousInfos.$imagesEtag;
        }

        this._movieDB.tvImages(p, (error, infos, req) => {
          if (error) {
            console.error(error);
            return callback(error);
          }
          this._processRequestResponse(req);

          if (req && req.header.etag) {
            if (previousInfos.$imagesEtag === req.header.etag && !this.configuration.ignoreETAG) {
              debug("TvImages has same etag !");

              ret.$imagesTimestamp = (new Date()).toUTCString();
              ret.posters = previousInfos.posters;
              ret.backdrops = previousInfos.backdrops;
              return callback();
            }

            ret.$imagesEtag = req.header.etag;
          }
          ret.$imagesTimestamp = (new Date()).toUTCString();

          // console.log("TvImages=",json.key, infos);

          if (infos.posters && infos.posters.length) {
            ret.posters = infos.posters.map((poster) =>
            ({ path: poster.file_path, width: poster.width, height: poster.height })
            );
          }

          if (infos.backdrops && infos.backdrops.length) {
            ret.backdrops = infos.backdrops.map((poster) =>
            ({ path: poster.file_path, width: poster.width, height: poster.height })
            );
          }

          callback();
        });
      }, (error) => {
        if (error) {
          return callback(error);
        }

        debug("loadTvShow", "key=", key, "returns=", ret);

        var seasons = ret.seasons || [];
        if (!seasons.length) {
          callback(null, ret);
          return;
        }

        delete ret.seasons;

        var previousSeasons = previousInfos.seasons || {};

        var tasks = [];
        seasons.forEach((season, idx) => {
          tasks.push((callback) => {
            var i = idx;

            this._syncSeason(key, seasons[i], previousSeasons[i], callback);
          });
        });

        Async.parallel(tasks, (error) => {
          debug("loadTvShow", "Seasons synced ! error=", error);

          if (error) {
            return callback(error);
          }

          ret.seasons = seasons;

          callback(null, ret);
        });
      });
    });
  }

  _syncSeason(tvKey, season, previousSeason, callback) {
    debug("_syncSeason", "key=", tvKey, "season=", season.season_number);

    previousSeason = previousSeason || {};
    var lang = this.configuration.lang || 'fr';

    this._newRequest((callback) => {
      var p = { id: tvKey, season_number: season.season_number, language: lang };

      if (previousSeason.$timestamp) {
        p.ifModifiedSince = new Date(previousSeason.$timestamp);
      }
      if (previousSeason.$etag && !this.configuration.ignoreETAG) {
        p.ifNoneMatch = season.$etag;
      }

      this._movieDB.tvSeasonInfo(p, (error, infos, req) => {

        debug("_syncSeason", "tvSeasonInfo response key=", tvKey, "season=", season.season_number, "error=", error);
        if (error) {
          return callback(error);
        }
        this._processRequestResponse(req);

        if (req && req.header.etag) {
          if (previousSeason.$etag === req.header.etag && !this.configuration.ignoreETAG) {
            debug("_syncSeason", "SAME ETAG ! (SEASON)");

            Object.assign(season, previousSeason);
            season.$timestamp = (new Date()).toUTCString();

            return callback();
          }

          season.$etag = req.header.etag;
        }

        season.$timestamp = (new Date()).toUTCString();

        // debug("Season Infos=",util.inspect(infos, {depth: null}));

        if (!infos.production_code) {
          delete infos.production_code;
        }
        if (!infos.overview) {
          delete infos.overview;
        }

        if (infos.poster_path) {
          delete infos.poster_path;
          //tasks.push((callback) => this.copyImage(season.poster_path, tvPath, callback));
        }

        infos.episodes.forEach((episode) => {
          // console.log("E=",episode);

          if (!episode.still_path) {
            delete episode.still_path;
          }
          if (!episode.production_code) {
            delete episode.production_code;
          }
          if (!episode.overview) {
            delete episode.overview;
          }
          if (episode.crew && !episode.crew.length) {
            delete episode.crew;
          }
          if (episode.guest_stars && !episode.guest_stars.length) {
            delete episode.guest_stars;
          }

          if (episode.still_path) {
            //delete episode.still_path;
            //tasks.push((callback) => this.copyImage(episode, "still_path", tvPath, callback));
          }
          if (episode.poster_path) {
            //delete episode.poster_path;
            //tasks.push((callback) => this.copyImage(episode, "poster_path", tvPath, callback));
          }

          (episode.crew || []).forEach((c) => {
            if (c.profile_path) {
              //tasks.push((callback) => this.copyImage(c.profile_path, tvPath, callback));
            }
            if (!c.profile_path) {
              delete c.profile_path;
            }
          });
          (episode.guest_stars || []).forEach((c) => {
            if (c.profile_path) {
              //tasks.push((callback) => this.copyImage(c.profile_path, tvPath, callback));
            }
            if (!c.profile_path) {
              delete c.profile_path;
            }
          });
        });

        Object.assign(season, infos);

        callback();
      });
    }, () => {
      debug("_syncSeason", "tvSeasonInfo images key=", tvKey, "season=", season.season_number);

      this._newRequest((callback) => {
        var p = {
            id: tvKey,
            season_number: season.season_number,
            language: lang,
            include_image_language: IMAGE_LANGUAGES
        };

        if (previousSeason.$imagesTimestamp) {
          p.ifModifiedSince = new Date(previousSeason.$imagesTimestamp);
        }

        if (previousSeason.$imagesEtag && !this.configuration.ignoreETAG) {
          p.ifNoneMatch = previousSeason.$imagesEtag;
        }

        this._movieDB.tvSeasonImages(p, (error, infos, req) => {
          debug("_syncSeason", "tvSeasonInfo IMAGES response key=", tvKey, "season=", season.season_number, "error=", error);

          if (error) {
            console.error(error);
            return callback(error);
          }
          this._processRequestResponse(req);

          if (req && req.header.etag) {
            if (previousSeason.$imagesEtag === req.header.etag && !this.configuration.ignoreETAG) {
              debug("_syncSeason", "SeasonImages has same etag !");

              season.posters = previousSeason.posters;
              season.backdrops = previousSeason.backdrops;
              season.$imagesTimestamp = (new Date()).toUTCString();

              return callback();
            }

            season.$imagesEtag = req.header.etag;
          }
          season.$imagesTimestamp = (new Date()).toUTCString();

          //console.log("SeasonImages=",json.key,season.season_number,infos);

          if (infos.posters && infos.posters.length) {
            season.posters = infos.posters.map((poster) => ({
              path: poster.file_path,
              width: poster.width,
              height: poster.height
            }));
          }

          if (infos.backdrops && infos.backdrops.length) {
            season.backdrops = infos.backdrops.map((poster) => ({
              path: poster.file_path,
              width: poster.width,
              height: poster.height
            }));
          }
          callback();
        });

      }, () => {
        var episodes = season.episodes || [];
        var previousEpisodes = previousSeason.episodes || {};

        var tasks = [];
        episodes.forEach((season, idx) => {
          tasks.push((callback) => {
            var i = idx;

            this._syncEpisode(tvKey, season.season_number, episodes[i], previousEpisodes[i], callback);
          });
        });

        Async.parallel(tasks, (error) => {
          debug("loadTvShow", "Episodes synced ! error=", error);

          if (error) {
            return callback(error);
          }

          callback();
        });
      });
    });
  }

  _syncEpisode(tvKey, seasonNumber, episode, previousEpisode, callback) {
    debug("_syncEpisode", "tvSeasonInfo images key=", tvKey, "season=", seasonNumber, "episode=", episode.episode_number);

    previousEpisode = previousEpisode || {};
    var lang = this.configuration.lang || 'fr';

    this._newRequest((callback) => {
      var p = {
          id: tvKey,
          season_number: seasonNumber,
          episode_number: episode.episode_number,
          language: lang,
          include_image_language: IMAGE_LANGUAGES
      };

      if (previousEpisode.$imagesTimestamp) {
        p.ifModifiedSince = new Date(previousEpisode.$imagesTimestamp);
      }

      if (previousEpisode.$imagesEtag && !this.configuration.ignoreETAG) {
        p.ifNoneMatch = previousEpisode.$imagesEtag;
      }

      this._movieDB.tvEpisodeImages(p, (error, infos, req) => {
        debug("_syncEpisode", "tvEpisodeImages IMAGES response key=", tvKey, "season=", seasonNumber, "episode=", episode.episode_number, "error=", error);

        if (error) {
          console.error(error);
          return callback(error);
        }
        this._processRequestResponse(req);

        if (req && req.header.etag) {
          if (previousEpisode.$imagesEtag === req.header.etag && !this.configuration.ignoreETAG) {
            debug("_syncEpisode", "EpisodesImages has same etag !");

            episode.posters = previousEpisode.posters;
            episode.stills = previousEpisode.stills;
            episode.$imagesTimestamp = (new Date()).toUTCString();

            return callback();
          }

          episode.$imagesEtag = req.header.etag;
        }
        episode.$imagesTimestamp = (new Date()).toUTCString();

        //console.log("SeasonImages=",json.key,season.season_number,infos);

        if (infos.posters && infos.posters.length) {
          episode.posters = infos.posters.map((poster) => ({
            path: poster.file_path,
            width: poster.width,
            height: poster.height
          }));
        }

        if (infos.stills && infos.stills.length) {
          episode.stills = infos.stills.map((poster) => ({
            path: poster.file_path,
            width: poster.width,
            height: poster.height
          }));
        }
        callback();
      });
    }, () => {
      callback();
    });
  }

  loadImage(dest, path, update, callback) {
    debug("loadImage", "Load image dest=", dest);

    if (!this._movieDB) {
      return callback();
    }

    this._loadConfiguration((error, configuration) => {
      if (error) {
        return callback(error);
      }
      if (!configuration) {
        return callback(new Error("Can not load configuration"));
      }

      this._imagesSemaphore.take(path, (semaphore) => {
        dest.stat((error, stats) => {
          if (!update && stats) {
            return callback(null, stats);
          }

          if (error && error.code !== 'ENOENT') {
            return callback(error);
          }

          var imageURL = configuration.images.secure_base_url + "original/" + path; // +"?api_key="+this.movieDB.api_key;

          var options = {
              uri: imageURL,
              headers: {}
          };

          if (stats) {
            options.headers['If-Modified-Since'] = stats.mtime.toUTCString();
          }

          debug("loadImage", "Request image dest=", dest, "url=", options);

          dest.createWriteStream({ autoClose: true }, (error, outputStream) => {
            if (error) {
              logger.error(error);
              return;
            }

            var stream = request.get(options);

            stream.on('response', (response) => {
              //console.log("ImageResponse=",response.headers);
              this._processRequestResponse(response);

              if (response.statusCode === 200) {
                stream.pipe(outputStream);
                return;
              }

              if (response.statusCode === 304) {
                debug("Image is not modified !");
                return;
              }

              logger.info("StatusCode=" + response.statusCode); // 200
              logger.info("ContentType=" + response.headers['content-type']); // 'image/png'
            });

            stream.on('end', () => {
              //          debug("Download done !");

              dest.stat(callback);
            });
          });
        });
      });
    });
  }
}


module.exports = TmdbAPI;
