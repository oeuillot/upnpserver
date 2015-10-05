/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var assert = require('assert');
var Util = require('util');
var Async = require("async");
var Path = require('path');
var Semaphore = require('semaphore');

var debug = require('debug')('upnpserver:VideoRepository');
var logger = require('../logger');

var ScannerRepository = require('./scannerRepository');
var ContentDirectoryService = require('../contentDirectoryService');

var Item = require('../class/object.item');
var VideoGenre = require('../class/object.container.genre.videoGenre');
var Movie = require('../class/object.item.videoItem.movie');
var MovieActor = require('../class/object.container.person.movieActor');

var VideoRepository = function(repositoryId, mountPath, path) {
  ScannerRepository.call(this, repositoryId, mountPath, path);

  this._scannerSemaphore = Semaphore(1);
};

Util.inherits(VideoRepository, ScannerRepository);

module.exports = VideoRepository;

VideoRepository.prototype.keepFile = function(infos) {
  var mime = infos.mime;
  var mimePart = mime.split("/");

  if (mimePart.length !== 2 || mimePart[0] !== "video") {
    return false;
  }

  return true;
};

VideoRepository.prototype.processFile = function(rootItem, infos, callback) {
  var contentURL = infos.contentURL;
  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var self = this;

  var attributes = {
    contentURL : contentURL
  };

  var name = Path.basename(contentURL);
  var semaphore = this._scannerSemaphore;

  this.contentDirectoryService.createNode(name, Movie.UPNP_CLASS, attributes,
      function(error, node) {
        if (error) {
          semaphore.leave();
          return callback(error);
        }

        node.getAttributes(ContentDirectoryService.MED_PRIORITY, function(
            error, attributes) {
          if (error) {
            return callback(error);
          }

          assert(attributes, "Attributes var is null");

          // console.log("Attributes of #" + node.id, attributes);

          semaphore.take(function() {

            var title = attributes.title || node.name || i18n.UNKNOWN_TITLE;
            var originalTitle = attributes.originalTitle || title;
            var actors = attributes.actors;
            var genres = attributes.genres;
            var year = (attributes.year && Date.UTC(attributes.year, 0)) ||
                attributes.releaseDate || attributes.date;
            var is3D = false;

            var itemData = {
              node : node,
              path : contentURL,

              title : title,
              originalTitle : originalTitle,
              actors : actors,
              genres : genres,
              year : year,
              is3D : is3D
            };

            self.registerMoviesFolder(rootItem, itemData, function(error,
                movieItem) {
              if (error) {
                semaphore.leave();
                return callback(error);
              }

              // itemData.musicTrackItem = musicTrackItem;

              var tasks = [];

              if (actors) {
                actors.forEach(function(actor) {
                  // console.log("Actor=", actor);
                  if (!actor) {
                    // artist = i18n.UNKNOWN_ARTIST;
                    return;
                  }
                  actor = actor.name.trim();
                  tasks.push({
                    fn : self.registerActorsFolder,
                    param : actor
                  });
                });
              }

              if (genres) {
                genres.forEach(function(genre) {
                  // console.log("Genre=", genre);
                  if (!genre) {
                    // genre = i18n.UNKNOWN_GENRE;
                    return;
                  }
                  genre = genre.name.trim();
                  tasks.push({
                    fn : self.registerGenresFolder,
                    param : genre
                  });
                });
              }

              if (originalTitle) {
                tasks.push({
                  fn : self.registerOriginalTitlesFolder,
                  param : originalTitle
                });
              }

              if (year) {
                tasks.push({
                  fn : self.registerYearsFolder,
                  param : year
                });
              }

              Async.eachSeries(tasks, function(task, callback) {
                // logger.debug("Task: ", task.fn, task.param);

                task.fn.call(self, rootItem, itemData, task.param, callback);

              }, function(error) {
                semaphore.leave();

                if (error) {
                  return callback(error);
                }

                callback();
              });
            });
          });
        });
      });
};

VideoRepository.prototype.registerActorsFolder = function(parentItem, itemData,
    actorName, callback) {

  assert(typeof (actorName) === "string", "Invalid actorName parameter");

  var actorsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_ACTORS_FOLDER;

  var self = this;
  parentItem.getChildByName(actorsLabel, function(error, actorsItem) {

    if (error) {
      return callback(error);
    }

    if (actorsItem) {
      return self.registerActor(actorsItem, itemData, actorName, callback);
    }

    if (debug.enabled) {
      debug("Register actors folder in " + parentItem.id);
    }

    self.newVirtualContainer(parentItem, actorsLabel, function(error,
        actorsItem) {
      if (error) {
        return callback(error);
      }

      self.registerActor(actorsItem, itemData, actorName, callback);
    });
  });
};

VideoRepository.prototype.registerActor = function(parentItem, itemData,
    actorName, callback) {

  assert(typeof (actorName) === "string", "Invalid actorName parameter");

  var self = this;
  parentItem.getChildByName(actorName, function(error, actorItem) {
    if (error) {
      return callback(error);
    }

    if (actorItem) {
      return self.registerMovie(actorItem, itemData.title, itemData, callback);
    }

    if (debug.enabled) {
      debug("Register actor on " + parentItem.id + " actor=" + actorName);
    }

    self.newVirtualContainer(parentItem, actorName, MovieActor.UPNP_CLASS,
        null, function(error, actorItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(actorItem, itemData.title, itemData, callback);
        });
  });
};

VideoRepository.prototype.registerMovie = function(parentItem, title, itemData,
    callback) {

  // console.log("Register title "+title);

  var self = this;
  parentItem.getChildByName(title, function(error, movieItem) {
    if (error) {
      return callback(error);
    }

    if (movieItem) {
      itemData.movieItem = movieItem;

      return callback(null, movieItem);
    }

    if (itemData.movieItem) {
      if (true || debug.enabled) {
        debug("Link title on " + parentItem.id + " title=" + title);
      }

      return self.newNodeRef(parentItem, itemData.movieItem, null, function(
          error, item) {
        if (error) {
          return callback(error);
        }

        item.attributes = item.attributes || {};
        item.attributes.title = title;

        callback(null, item);
      });
    }

    if (itemData.node) {
      parentItem.appendChild(itemData.node, function(error) {
        if (error) {
          return callback(error);
        }

        itemData.movieItem = itemData.node;
        delete itemData.node;

        callback(null, itemData.movieItem);
      });
      return;
    }

    throw new Error("Never happen ! " + Util.inspect(itemData));
  });
};

VideoRepository.prototype.registerGenresFolder = function(parentItem, itemData,
    genreName, callback) {

  return this.registerGenre(parentItem, itemData, genreName, callback);
};

VideoRepository.prototype.registerGenre = function(parentItem, itemData,
    genreName, callback) {

  var self = this;
  parentItem.getChildByName(genreName, function(error, genreItem) {
    if (error) {
      return callback(error);
    }

    if (genreItem) {
      return self.registerMovie(genreItem, itemData.title, itemData, callback);
    }

    self.newVirtualContainer(parentItem, genreName, VideoGenre.UPNP_CLASS,
        null, function(error, genreItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(genreItem, itemData.title, itemData, callback);
        });
  });
};

VideoRepository.prototype.registerMoviesFolder = function(parentItem, itemData,
    callback) {

  var moviesLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_TITLE_FOLDER;

  var self = this;
  parentItem.getChildByName(moviesLabel,
      function(error, moviesItem) {

        if (error) {
          return callback(error);
        }

        if (moviesItem) {
          return self.registerMovie(moviesItem, itemData.title, itemData,
              callback);
        }

        if (debug.enabled) {
          debug("Register movies folder in " + parentItem.id);
        }

        self.newVirtualContainer(parentItem, moviesLabel, function(error,
            moviesItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(moviesItem, itemData.title, itemData, callback);
        });
      });
};

VideoRepository.prototype.registerOriginalTitlesFolder = function(parentItem,
    itemData, originalTitle, callback) {

  assert(typeof (originalTitle) === "string",
      "Invalid original title parameter");

  var originalTitlesLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_ORIGINAL_TITLE_FOLDER;

  var self = this;
  parentItem.getChildByName(originalTitlesLabel, function(error,
      originalTitlesItem) {

    if (error) {
      return callback(error);
    }

    console.log("Register originalTitle=" + originalTitle);

    if (originalTitlesItem) {
      return self.registerMovie(originalTitlesItem, originalTitle, itemData,
          callback);
    }

    if (debug.enabled) {
      debug("Register original titles folder in " + parentItem.id);
    }

    self.newVirtualContainer(parentItem, originalTitlesLabel,
        function(error, originalTitlesItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(originalTitlesItem, originalTitle, itemData,
              callback);
        });
  });
};

VideoRepository.prototype.registerYearsFolder = function(parentItem, itemData,
    year, callback) {

  var byYearsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_YEARS_FOLDER;

  var self = this;
  parentItem.getChildByName(byYearsLabel, function(error, byYearsItem) {

    if (error) {
      return callback(error);
    }

    if (byYearsItem) {
      return self.registerYear(byYearsItem, itemData, year, callback);
    }

    if (debug.enabled) {
      debug("Register years folder in " + parentItem.id);
    }

    self.newVirtualContainer(parentItem, byYearsLabel, function(error,
        byYearsItem) {
      if (error) {
        return callback(error);
      }

      self.registerYear(byYearsItem, itemData, year, callback);
    });
  });
};

VideoRepository.prototype.registerYear = function(parentItem, itemData, year,
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

  var self = this;
  parentItem.getChildByName(year, function(error, yearItem) {
    if (error) {
      return callback(error);
    }

    if (yearItem) {
      return self.registerMovie(yearItem, itemData.title, itemData, callback);
    }

    if (debug.enabled) {
      debug("Register year on " + parentItem.id + " year=" + year);
    }

    self.newVirtualContainer(parentItem, year, MovieActor.UPNP_CLASS, null,
        function(error, yearItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(yearItem, itemData.title, itemData, callback);
        });
  });
};
