/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Async = require("async");
const Path = require('path');
const Util = require('util');

const debug = require('debug')('upnpserver:repository:Video');
const logger = require('../logger');

const ScannerRepository = require('./scannerRepository');
const ContentDirectoryService = require('../contentDirectoryService');

const Item = require('../class/object.item');
var VideoGenre = require('../class/object.container.genre.videoGenre');
const Movie = require('../class/object.item.videoItem.movie');
const MovieActor = require('../class/object.container.person.movieActor');

class VideoRepository extends ScannerRepository {

  keepFile(infos) {
    var mime = infos.mime;
    var mimePart = mime.split("/");

    if (mimePart.length !== 2 || mimePart[0] !== "video") {
      return false;
    }

    return true;
  }

  processFile(rootNode, infos, callback) {
    var contentURL = infos.contentURL;
    var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

    var attributes = {
        contentURL : contentURL
    };

    var name = Path.basename(contentURL);
    
    debug("Starting process file parent=#", rootNode.id, "path=",
        infos.contentURL,"name=",name);

    this.contentDirectoryService.createNode(name, Movie.UPNP_CLASS, attributes,
        (error, node) => {
          if (error) {
            return callback(error);
          }
          
          debug("Node created for file parent=#", rootNode.id, "name=",name);

          node.getAttributes(ContentDirectoryService.MED_PRIORITY, (error, attributes) => {
            if (error) {
              console.error(error);
              return callback(error);
            }

            assert(attributes, "Attributes var is null");

            debug("Attributes of #", node.id, attributes);

            var title = attributes.title || node.name || i18n.UNKNOWN_TITLE;
            var originalTitle = attributes.originalTitle || title;
            var actors = attributes.actors;
            var genres = attributes.genres;
            var year = (attributes.year && Date.UTC(attributes.year, 0)) ||
            attributes.releaseDate || attributes.date;
            var is3D = false;

            var itemData = {
                node : node,
                contentURL : contentURL,

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

                if (error) {
                  return callback(error);
                }

                callback();
              });
            });
          });
        });
  }

  registerActorsFolder(parentNode, itemData,
      actorName, callback) {

    sync(this, this.registerActorsFolder0, arguments);
  }

  registerActorsFolder0(parentNode,
      itemData, actorName, callback) {

    assert(typeof (actorName) === "string", "Invalid actorName parameter");

    var actorsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_ACTORS_FOLDER;

    parentNode.getChildByName(actorsLabel, (error, actorsNode) => {

      if (error) {
        return callback(error);
      }

      debug("Find actors container", actorsLabel, "in #", parentNode.id, "=>",
          !!actorsNode);

      if (actorsNode) {
        return this.registerActor(actorsNode, itemData, actorName, callback);
      }

      debug("Register actors folder in #", parentNode.id);

      this.newVirtualContainer(parentNode, actorsLabel, (error, actorsNode) => {
        if (error) {
          return callback(error);
        }

        this.registerActor(actorsNode, itemData, actorName, callback);
      });
    });
  }

  registerActor(parentNode, itemData, artistName, callback) {

    sync(this, this.registerActor0, arguments);
  }

  registerActor0(parentNode, itemData, actorName, callback) {

    assert(typeof (actorName) === "string", "Invalid actorName parameter");

    parentNode.getChildByName(actorName, (error, actorNode) => {
      if (error) {
        return callback(error);
      }

      debug("Find actor container name=", actorName, "in #", parentNode.id, "=>",
          !!actorNode);

      if (actorNode) {
        return this.registerMovie(actorNode, itemData.title, itemData, callback);
      }

      debug("Register actor on #", parentNode.id, "actor=", actorName);

      this.newVirtualContainer(parentNode, actorName, MovieActor.UPNP_CLASS,
          null, (error, actorNode) => {
            if (error) {
              return callback(error);
            }

            this.registerMovie(actorNode, itemData.title, itemData, callback);
          });
    });
  }

  registerMovie(parentNode, title, itemData, callback) {

    sync(this, this.registerMovie0, arguments);
  }

  registerMovie0(parentNode, title, itemData, callback) {
    var exploded = parentNode.attributes.exploded;
    if (!exploded) {
      parentNode.listChildren((error, list) => {
        if (error) {
          return callback(error);
        }

        // if (list.length < 100) {
        return this.registerMovie2(parentNode, title, itemData, 0, callback);
        // }

        // We must explode the directory

      });
      return;
    }

    callback();
  }

  registerMovie2(parentNode, title, itemData, tryCount, callback) {

    // console.log("Register title "+title);

    var t = title;
    if (tryCount) {
      t += "  (#" + (tryCount) + ")";
    }

    parentNode.getChildByTitle(t, (error, movieNode) => {
      if (error) {
        return callback(error);
      }

      debug("Find movie title=", t, "in #", parentNode.id, "=>", !!movieNode);

      if (movieNode) {
        movieNode
        .resolveLink((error, mu) => {
          debug("Compare movie contentURL=", mu.attributes.contentURL, "<>",
              itemData.contentURL);

          if (mu.attributes.contentURL === itemData.contentURL) {
            itemData.movieNode = mu;

            return callback(null, mu);
          }

          debug("Register title on #", parentNode.id, " title=", t);

          this.registerMovie2(parentNode, title, itemData, tryCount + 1,
              callback);
        });
        return;
      }

      if (itemData.movieNode) {
        debug("Link title on #", parentNode.id, "title=", title);

        return this.newNodeRef(parentNode, itemData.movieNode, null, (
            error, movieNode) => {
              if (error) {
                return callback(error);
              }

              movieNode.attributes = movieNode.attributes || {};
              movieNode.attributes.title = title;

              callback(null, movieNode);
            });
      }

      if (itemData.node) {
        debug("Append movie on #", parentNode.id, "title=", title);
        parentNode.appendChild(itemData.node, (error) => {
          if (error) {
            return callback(error);
          }

          itemData.movieNode = itemData.node;
          delete itemData.node;

          callback(null, itemData.movieNode);
        });
        return;
      }

      throw new Error("Never happen ! " + Util.inspect(itemData));
    });
  }

  registerGenresFolder(parentItem, itemData,
      genreName, callback) {

    return this.registerGenre(parentItem, itemData, genreName, callback);
  }

  registerGenre(parentNode, itemData,
      genreName, callback) {

    sync(this, this.registerGenre0, arguments);
  }

  registerGenre0(parentItem, itemData,
      genreName, callback) {

    parentItem.getChildByName(genreName, (error, genreItem) => {
      if (error) {
        return callback(error);
      }

      debug("Find genre container", genreName, "in #", parentItem.id, "=>",
          !!genreItem);

      if (genreItem) {
        return this.registerMovie(genreItem, itemData.title, itemData, callback);
      }

      this.newVirtualContainer(parentItem, genreName, VideoGenre.UPNP_CLASS,
          null, (error, genreItem) => {
            if (error) {
              return callback(error);
            }

            this.registerMovie(genreItem, itemData.title, itemData, callback);
          });
    });
  }

  registerMoviesFolder(parentNode, itemData,
      callback) {

    sync(this, this.registerMoviesFolder0, arguments);
  }

  registerMoviesFolder0(parentNode,
      itemData, callback) {

    var moviesLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_TITLE_FOLDER;

    parentNode.getChildByName(moviesLabel, (error, moviesNode) => {

      if (error) {
        return callback(error);
      }

      debug("Find movies container", moviesLabel, "in #", parentNode.id,
          "=>", !!moviesNode);

      if (moviesNode) {
        return this.registerMovie(moviesNode, itemData.title, itemData,
            callback);
      }

      debug("Register movies folder in #", parentNode.id);

      this.newVirtualContainer(parentNode, moviesLabel, (error, moviesNode) => {
        if (error) {
          return callback(error);
        }

        this.registerMovie(moviesNode, itemData.title, itemData, callback);
      });
    });
  }

  registerOriginalTitlesFolder(parentNode,
      itemData, originalTitle, callback) {

    sync(this, this.registerOriginalTitlesFolder0, arguments);
  }

  registerOriginalTitlesFolder0(parentItem,
      itemData, originalTitle, callback) {

    assert(typeof (originalTitle) === "string",
    "Invalid original title parameter");

    var originalTitlesLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_ORIGINAL_TITLE_FOLDER;

    parentItem.getChildByName(originalTitlesLabel, (error,
        originalTitlesItem) => {

          if (error) {
            return callback(error);
          }

          // console.log("Register originalTitle=" + originalTitle);

          if (originalTitlesItem) {
            return this.registerMovie(originalTitlesItem, originalTitle, itemData,
                callback);
          }

          debug("Register original titles folder in #", parentItem.id);

          this.newVirtualContainer(parentItem, originalTitlesLabel,
              (error, originalTitlesItem) => {
                if (error) {
                  return callback(error);
                }

                this.registerMovie(originalTitlesItem, originalTitle, itemData,
                    callback);
              });
        });
  }

  registerYearsFolder(parentNode, itemData,
      year, callback) {

    sync(this, this.registerYearsFolder0, arguments);
  }

  registerYearsFolder0(parentItem, itemData,
      year, callback) {

    var byYearsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_YEARS_FOLDER;

    parentItem.getChildByName(byYearsLabel, (error, byYearsItem) => {

      if (error) {
        return callback(error);
      }

      if (byYearsItem) {
        return this.registerYear(byYearsItem, itemData, year, callback);
      }

      debug("Register years folder in #", parentItem.id);

      this.newVirtualContainer(parentItem, byYearsLabel, (error, byYearsItem) => {
        if (error) {
          return callback(error);
        }

        this.registerYear(byYearsItem, itemData, year, callback);
      });
    });
  }

  registerYear(parentNode, itemData, year,
      callback) {

    sync(this, this.registerYear0, arguments);
  }

  registerYear0(parentItem, itemData, year,
      callback) {

    if (typeof (year) === "number") {
      year = new Date(year);
    }
    if (year.getFullYear) {
      year = year.getFullYear();
    }
    if (typeof (year) !== "string") {
      year = String(year);
    }

    parentItem.getChildByName(year, (error, yearItem) => {
      if (error) {
        return callback(error);
      }

      if (yearItem) {
        return this.registerMovie(yearItem, itemData.title, itemData, callback);
      }

      debug("Register year on #", parentItem.id, "year=", year);

      this.newVirtualContainer(parentItem, year, MovieActor.UPNP_CLASS, null,
          (error, yearItem) => {
            if (error) {
              return callback(error);
            }

            this.registerMovie(yearItem, itemData.title, itemData, callback);
          });
    });
  }
}


function sync(self, func, args) {
  var parentNode = args[0];
  var ag = Array.prototype.slice.call(args, 0);
  ag[ag.length - 1] = (error) => {
    parentNode._leave("scanner");
    return args[args.length - 1](error);
  };

  parentNode._take("scanner", () => func.apply(self, ag));
}

module.exports = VideoRepository;
