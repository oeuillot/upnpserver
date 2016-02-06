/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Async = require("async");
const Path = require('path');
const Util = require('util');

const debug = require('debug')('upnpserver:repositories:Video');
const logger = require('../logger');

const ScannerRepository = require('./scanner');
const ContentDirectoryService = require('../contentDirectoryService');

const Item = require('../class/object.item');
const VideoGenre = require('../class/object.container.genre.videoGenre');
const Movie = require('../class/object.item.videoItem.movie');
const MovieActor = require('../class/object.container.person.movieActor');

const STOP_IF_ALREADY_IN_MOVIES_FOLDER = false;

class MovieRepository extends ScannerRepository {

  get type() {
    return "movie";
  }

  keepFile(infos) {
    var mimeType = infos.mimeType;
    var mimePart = mimeType.split("/");

    if (mimePart.length !== 2 || mimePart[0] !== "video") {
      return false;
    }

    return true;
  }

  processFile(rootNode, infos, callback) {
    var contentURL = infos.contentURL;

    var name = Path.basename(contentURL);

    debug("processFile", "Starting process file parent=#", rootNode.id, "path=",
        infos.contentURL,"name=",name);

    this.service.loadMetas(infos, (error, attributes) => {
      if (error) {
        return callback(error);
      }

      assert(attributes, "Attributes var is null");

      debug("processFile", "Attributes of", contentURL, attributes);

      function isEmpty(ar) {
        return !ar || !ar.length;
      }

      if (!attributes.originalTitle && isEmpty(attributes.actors) && 
          isEmpty(attributes.genres) && !attributes.releaseDate) {
        return callback(null);
      }

      var i18n = this.service.upnpServer.configuration.i18n;

      var title = attributes.title || name || i18n.UNKNOWN_TITLE;
      var originalTitle = attributes.originalTitle || title;
      var actors = attributes.actors;
      var genres = attributes.genres;
      var year = (attributes.year && Date.UTC(attributes.year, 0)) || attributes.releaseDate || attributes.date;
      var is3D = attributes['3D'];

      var itemData = {
          attributes : attributes,
          contentURL : contentURL,
          stats: infos.stats,

          title : title,
          originalTitle : originalTitle,
          actors : actors,
          genres : genres,
          year : year,
          is3D : is3D
      };

      this.registerMoviesFolder(rootNode, itemData, (error, movieItem) => {
        if (error) {
          return callback(error);
        }

        // The film is registred in movies folder, so ignore others
        if (STOP_IF_ALREADY_IN_MOVIES_FOLDER && itemData.sameFound) {
          return callback();
        }

        // itemData.musicTrackItem = musicTrackItem;

        var tasks = [];

        if (actors) {
          actors.forEach((actor) => {
            // console.log("Actor=", actor);
            if (!actor) {
              // artist = i18n.UNKNOWN_ARTIST;
              return;
            }
            actor = actor.name.trim();
            tasks.push({
              fn : this.registerActorsFolder,
              param : actor
            });
          });
        }

        if (genres) {
          genres.forEach((genre) => {
            // console.log("Genre=", genre);
            if (!genre) {
              // genre = i18n.UNKNOWN_GENRE;
              return;
            }
            genre = genre.name.trim();
            tasks.push({
              fn : this.registerGenresFolder,
              param : genre
            });
          });
        }

        if (originalTitle) {
          tasks.push({
            fn : this.registerOriginalTitlesFolder,
            param : originalTitle
          });
        }

        if (year) {
          tasks.push({
            fn : this.registerYearsFolder,
            param : year
          });
        }

        Async.eachSeries(tasks, (task, callback) => {
          // logger.debug("Task: ", task.fn, task.param);

          task.fn.call(this, rootNode, itemData, task.param, callback);

        }, (error) => {
          debug("processFile", "Process file ended (",infos.contentURL,") error=",error);

          if (error) {
            return callback(error);
          }

          callback();
        });
      });
    });
  }

  /**
   * 
   */
  registerActorsFolder(parentNode, itemData, actorName, callback) {

    assert.equal(typeof (actorName), "string", "Invalid actorName parameter");

    parentNode.takeLock("scanner", () => {

      var actorsLabel = this.service.upnpServer.configuration.i18n.BY_ACTORS_FOLDER;

      parentNode.getFirstVirtualChildByTitle(actorsLabel, (error, actorsNode) => {

        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        debug("registerActorsFolder0", "Find actors container", actorsLabel, "in #", parentNode.id, "=>",
            !!actorsNode);

        if (actorsNode) {
          parentNode.leaveLock("scanner");
          return this.registerActor(actorsNode, itemData, actorName, callback);
        }

        debug("registerActorsFolder0", "Register actors folder in #", parentNode.id);

        this.newVirtualContainer(parentNode, actorsLabel, (error, actorsNode) => {
          parentNode.leaveLock("scanner");
          if (error) {
            return callback(error);
          }

          this.registerActor(actorsNode, itemData, actorName, callback);
        });
      });
    });
  }

  /**
   * 
   */
  registerActor(parentNode, itemData, actorName, callback) {

    assert.equal(typeof (actorName), "string", "Invalid actorName parameter");

    parentNode.takeLock("scanner", () => {

      parentNode.getFirstVirtualChildByTitle(actorName, (error, actorNode) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        debug("registerActor0", "Find actor container name=", actorName, "in #", parentNode.id, "=>",
            !!actorNode);

        if (actorNode) {
          parentNode.leaveLock("scanner");
          return this.registerMovie(actorNode, itemData.title, itemData, callback);
        }

        debug("registerActor0", "Register actor on #", parentNode.id, "actor=", actorName);

        this.newVirtualContainer(parentNode, actorName, MovieActor.UPNP_CLASS,
            (error, actorNode) => {
              parentNode.leaveLock("scanner");

              if (error) {
                return callback(error);
              }

              this.registerMovie(actorNode, itemData.title, itemData, callback);
            });
      });
    });
  }

  /**
   * 
   */
  registerMovie(parentNode, title, itemData, callback) {

    parentNode.takeLock("scanner", () => {

      // console.log("Register title "+title);

      var appendMovie = () => {

        if (itemData.movieNode) {
          debug("registerMovie2", "Link title on #", parentNode.id, "title=", title);

          this.newNodeRef(parentNode, itemData.movieNode, title, (movieNode) => {

            //        movieNode.attributes = movieNode.attributes || {};
            //        movieNode.attributes.title = title;

          }, (error, movieNode) => {
            parentNode.leaveLock("scanner");

            if (error) {
              return callback(error);
            }

            callback(null, movieNode);
          });
          return;
        }

        debug("registerMovie2", "Create movie on #", parentNode.id, "title=" , title);
        this.newFile(parentNode, 
            itemData.contentURL, 
            Movie.UPNP_CLASS, 
            itemData.stats, 
            itemData.attributes,
            null, 
            (error, node) => {
              parentNode.leaveLock("scanner");

              if (error) {
                return callback(error);
              }

              itemData.movieNode = node;

              callback(null, node);
            });
      };

      parentNode.listChildrenByTitle(title, (error, movieNodes, movieLinks) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        debug("registerMovie2", "Find movie=", title, "in #", parentNode.id, "=>", movieNodes.length);

        if (!movieNodes.length) {
          appendMovie();
          return;
        }

        var mu=movieNodes.find((mu) => {
          if (debug.enabled) {
            debug("registerMovie2", "Compare movie contentURL=",
                mu.contentURL, "<>", itemData.contentURL,
                mu.contentTime, "<>", itemData.stats.mtime.getTime(), "#", mu.id);
          }

          return mu.contentURL === itemData.contentURL;
        });

        if (mu) {
          if (itemData.stats.mtime.getTime() === mu.contentTime) {
            parentNode.leaveLock("scanner");

            debug("registerMovie2", "Same movie on #", parentNode.id, " title=", title, "node #", mu.id);

            itemData.movieNode = mu;
            itemData.sameFound=true;

            return callback(null, mu);
          }

          // Not the same modification time !

          debug("registerMovie2", 
              "Not the same modification time for movie: parent #", parentNode.id, 
              "title=", title, "node #", mu.id);

          parentNode.removeChild(mu, (error) => {
            parentNode.leaveLock("scanner");

            if (error) {
              return callback(error);
            }

            appendMovie();
          });
          return;
        }

        appendMovie();
      });
    });
  }

  /**
   * 
   */
  registerGenresFolder(parentNode, itemData, genreName, callback) {

    return this.registerGenre(parentNode, itemData, genreName, callback);
  }

  /**
   * 
   */
  registerGenre(parentNode, itemData, genreName, callback) {

    parentNode.takeLock("scanner", () => {

      parentNode.getFirstVirtualChildByTitle(genreName, (error, genreNode) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        debug("registerGenre0", "Find genre container", genreName, "in #", parentNode.id, "=>",
            !!genreNode);

        if (genreNode) {
          parentNode.leaveLock("scanner");
          return this.registerMovie(genreNode, itemData.title, itemData, callback);
        }

        this.newVirtualContainer(parentNode, genreName, VideoGenre.UPNP_CLASS,
            (error, genreNode) => {
              parentNode.leaveLock("scanner");

              if (error) {
                return callback(error);
              }

              this.registerMovie(genreNode, itemData.title, itemData, callback);
            });
      });
    });
  }

  /**
   * 
   */
  registerMoviesFolder(parentNode, itemData, callback) {

    var moviesLabel = this.service.upnpServer.configuration.i18n.BY_TITLE_FOLDER;

    parentNode.takeLock("scanner", () => {

      parentNode.getFirstVirtualChildByTitle(moviesLabel, (error, moviesNode) => {

        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        debug("registerMoviesFolder0", 
            "Find movies container", moviesLabel, "in #", parentNode.id,
            "=>", !!moviesNode);

        if (moviesNode) {
          parentNode.leaveLock("scanner");
          return this.registerMovie(moviesNode, itemData.title, itemData,
              callback);
        }

        debug("registerMoviesFolder0", "Register movies folder in #", parentNode.id);

        this.newVirtualContainer(parentNode, moviesLabel, (error, moviesNode) => {
          parentNode.leaveLock("scanner");
          if (error) {
            return callback(error);
          }

          this.registerMovie(moviesNode, itemData.title, itemData, callback);
        });
      });
    });
  }

  /**
   * 
   */
  registerOriginalTitlesFolder(parentNode, itemData, originalTitle, callback) {
    assert.equal(typeof (originalTitle), "string", "Invalid original title parameter");

    var originalTitlesLabel = this.service.upnpServer.configuration.i18n.BY_ORIGINAL_TITLE_FOLDER;

    parentNode.takeLock("scanner", () => {

      parentNode.getFirstVirtualChildByTitle(originalTitlesLabel, (error, originalTitlesNode) => {

        debug("registerOriginalTitlesFolder0", 
            "Find original titles folder",originalTitlesLabel, "in #",parentNode.id,"=>",originalTitlesNode);

        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        // console.log("Register originalTitle=" + originalTitle);

        if (originalTitlesNode) {
          parentNode.leaveLock("scanner");
          this.registerMovie(originalTitlesNode, originalTitle, itemData, callback);
          return;
        }

        debug("registerOriginalTitlesFolder0", "Register original titles folder in #", parentNode.id);

        this.newVirtualContainer(parentNode, originalTitlesLabel,
            (error, originalTitlesNode) => {
              parentNode.leaveLock("scanner");
              if (error) {
                return callback(error);
              }

              this.registerMovie(originalTitlesNode, originalTitle, itemData,
                  callback);
            });
      });
    });
  }

  registerYearsFolder(parentNode, itemData, year, callback) {

    var byYearsLabel = this.service.upnpServer.configuration.i18n.BY_YEARS_FOLDER;

    parentNode.takeLock("scanner", () => {
  
      parentNode.getFirstVirtualChildByTitle(byYearsLabel, (error, byYearsItem) => {
  
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }
  
        if (byYearsItem) {
          parentNode.leaveLock("scanner");
          return this.registerYear(byYearsItem, itemData, year, callback);
        }
  
        debug("registerYearsFolder0", "Register years folder in #", parentNode.id);
  
        this.newVirtualContainer(parentNode, byYearsLabel, (error, byYearsItem) => {
          parentNode.leaveLock("scanner");
          if (error) {
            return callback(error);
          }
  
          this.registerYear(byYearsItem, itemData, year, callback);
        });
      });
    });
  }

  registerYear(parentNode, itemData, year, callback) {

    if (typeof (year) === "number") {
      year = new Date(year);
    }
    if (year.getFullYear) {
      year = year.getFullYear();
    }
    if (typeof (year) !== "string") {
      year = String(year);
    }

    parentNode.takeLock("scanner", () => {

      parentNode.getFirstVirtualChildByTitle(year, (error, yearNode) => {
        if (error) {
          parentNode.leaveLock("scanner");
          return callback(error);
        }

        if (yearNode) {
          parentNode.leaveLock("scanner");
          return this.registerMovie(yearNode, itemData.title, itemData, callback);
        }

        debug("registerYear0", "Register year on #", parentNode.id, "year=", year);

        this.newVirtualContainer(parentNode, year, MovieActor.UPNP_CLASS,
            (error, yearNode) => {
              parentNode.leaveLock("scanner");
              if (error) {
                return callback(error);
              }

              this.registerMovie(yearNode, itemData.title, itemData, callback);
            });
      });
    });
  }
}

module.exports = MovieRepository;
