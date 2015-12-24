/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var assert = require('assert');
var Util = require('util');
var Async = require("async");
var Path = require('path');

var debug = require('debug')('upnpserver:videoRepository');
var logger = require('../logger');

var ScannerRepository = require('./scannerRepository');
var ContentDirectoryService = require('../contentDirectoryService');

var Item = require('../class/object.item');
var VideoGenre = require('../class/object.container.genre.videoGenre');
var Movie = require('../class/object.item.videoItem.movie');
var MovieActor = require('../class/object.container.person.movieActor');

var VideoRepository = function(repositoryId, mountPath, path) {
  ScannerRepository.call(this, repositoryId, mountPath, path);
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

VideoRepository.prototype.processFile = function(rootNode, infos, callback) {
  var contentURL = infos.contentURL;
  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  debug("Video repository, starts process file parent=#", rootNode.id, "path=",
      infos.contentURL);

  var self = this;

  var attributes = {
    contentURL : contentURL
  };

  var name = Path.basename(contentURL);

  this.contentDirectoryService.createNode(name, Movie.UPNP_CLASS, attributes,
      function(error, node) {
        if (error) {
          return callback(error);
        }

        node.getAttributes(ContentDirectoryService.MED_PRIORITY, function(
            error, attributes) {
          if (error) {
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

          self.registerMoviesFolder(rootNode, itemData, function(error,
              movieItem) {
            if (error) {
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

              task.fn.call(self, rootNode, itemData, task.param, callback);

            }, function(error) {

              if (error) {
                return callback(error);
              }

              callback();
            });
          });
        });
      });
};

VideoRepository.prototype.registerActorsFolder = function(parentNode, itemData,
    actorName, callback) {

  sync(this, this.registerActorsFolder0, arguments);
};

VideoRepository.prototype.registerActorsFolder0 = function(parentNode,
    itemData, actorName, callback) {

  assert(typeof (actorName) === "string", "Invalid actorName parameter");

  var actorsLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_ACTORS_FOLDER;

  var self = this;
  parentNode.getChildByName(actorsLabel, function(error, actorsNode) {

    if (error) {
      return callback(error);
    }

    debug("Find actors container", actorsLabel, "in #", parentNode.id, "=>",
        !!actorsNode);

    if (actorsNode) {
      return self.registerActor(actorsNode, itemData, actorName, callback);
    }

    debug("Register actors folder in #", parentNode.id);

    self.newVirtualContainer(parentNode, actorsLabel, function(error,
        actorsNode) {
      if (error) {
        return callback(error);
      }

      self.registerActor(actorsNode, itemData, actorName, callback);
    });
  });
};

function sync(self, func, args) {
  var parentNode = args[0];
  var ag = Array.prototype.slice.call(args, 0);
  ag[ag.length - 1] = function(error) {
    parentNode._leave("scanner");
    return args[args.length - 1](error);
  };

  parentNode._take("scanner", function() {
    func.apply(self, ag);
  });
}

VideoRepository.prototype.registerActor = function(parentNode, itemData,
    artistName, callback) {

  sync(this, this.registerActor0, arguments);
};

VideoRepository.prototype.registerActor0 = function(parentNode, itemData,
    actorName, callback) {

  assert(typeof (actorName) === "string", "Invalid actorName parameter");

  var self = this;
  parentNode.getChildByName(actorName, function(error, actorNode) {
    if (error) {
      return callback(error);
    }

    debug("Find actor container name=", actorName, "in #", parentNode.id, "=>",
        !!actorNode);

    if (actorNode) {
      return self.registerMovie(actorNode, itemData.title, itemData, callback);
    }

    debug("Register actor on #", parentNode.id, "actor=", actorName);

    self.newVirtualContainer(parentNode, actorName, MovieActor.UPNP_CLASS,
        null, function(error, actorNode) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(actorNode, itemData.title, itemData, callback);
        });
  });
};

VideoRepository.prototype.registerMovie = function(parentNode, title, itemData,
    callback) {

  sync(this, this.registerMovie0, arguments);
};

VideoRepository.prototype.registerMovie0 = function(parentNode, title,
    itemData, callback) {
  var self = this;
  var exploded = parentNode.attributes.exploded;
  if (!exploded) {
    parentNode.listChildren(function(error, list) {
      if (error) {
        return callback(error);
      }

      // if (list.length < 100) {
      return self.registerMovie2(parentNode, title, itemData, 0, callback);
      // }

      // We must explode the directory

    });
    return;
  }

  callback();
};

VideoRepository.prototype.registerMovie2 = function(parentNode, title,
    itemData, tryCount, callback) {

  // console.log("Register title "+title);

  var t = title;
  if (tryCount) {
    t += "  (#" + (tryCount) + ")";
  }

  var self = this;
  parentNode.getChildByTitle(t, function(error, movieNode) {
    if (error) {
      return callback(error);
    }

    debug("Find movie title=", t, "in #", parentNode.id, "=>", !!movieNode);

    if (movieNode) {
      movieNode
          .resolveLink(function(error, mu) {
            debug("Compare movie contentURL=", mu.attributes.contentURL, "<>",
                itemData.contentURL);

            if (mu.attributes.contentURL === itemData.contentURL) {
              itemData.movieNode = mu;

              return callback(null, mu);
            }

            debug("Register title on #", parentNode.id, " title=", t);

            self.registerMovie2(parentNode, title, itemData, tryCount + 1,
                callback);
          });
      return;
    }

    if (itemData.movieNode) {
      debug("Link title on #", parentNode.id, "title=", title);

      return self.newNodeRef(parentNode, itemData.movieNode, null, function(
          error, movieNode) {
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
      parentNode.appendChild(itemData.node, function(error) {
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
};

VideoRepository.prototype.registerGenresFolder = function(parentItem, itemData,
    genreName, callback) {

  return this.registerGenre(parentItem, itemData, genreName, callback);
};

VideoRepository.prototype.registerGenre = function(parentNode, itemData,
    genreName, callback) {

  sync(this, this.registerGenre0, arguments);
};

VideoRepository.prototype.registerGenre0 = function(parentItem, itemData,
    genreName, callback) {

  var self = this;
  parentItem.getChildByName(genreName, function(error, genreItem) {
    if (error) {
      return callback(error);
    }

    debug("Find genre container", genreName, "in #", parentItem.id, "=>",
        !!genreItem);

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

VideoRepository.prototype.registerMoviesFolder = function(parentNode, itemData,
    callback) {

  sync(this, this.registerMoviesFolder0, arguments);
};

VideoRepository.prototype.registerMoviesFolder0 = function(parentNode,
    itemData, callback) {

  var moviesLabel = this.contentDirectoryService.upnpServer.configuration.i18n.BY_TITLE_FOLDER;

  var self = this;
  parentNode.getChildByName(moviesLabel,
      function(error, moviesNode) {

        if (error) {
          return callback(error);
        }

        debug("Find movies container", moviesLabel, "in #", parentNode.id,
            "=>", !!moviesNode);

        if (moviesNode) {
          return self.registerMovie(moviesNode, itemData.title, itemData,
              callback);
        }

        debug("Register movies folder in #", parentNode.id);

        self.newVirtualContainer(parentNode, moviesLabel, function(error,
            moviesNode) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(moviesNode, itemData.title, itemData, callback);
        });
      });
};

VideoRepository.prototype.registerOriginalTitlesFolder = function(parentNode,
    itemData, originalTitle, callback) {

  sync(this, this.registerOriginalTitlesFolder0, arguments);
};

VideoRepository.prototype.registerOriginalTitlesFolder0 = function(parentItem,
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

    // console.log("Register originalTitle=" + originalTitle);

    if (originalTitlesItem) {
      return self.registerMovie(originalTitlesItem, originalTitle, itemData,
          callback);
    }

    debug("Register original titles folder in #", parentItem.id);

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

VideoRepository.prototype.registerYearsFolder = function(parentNode, itemData,
    year, callback) {

  sync(this, this.registerYearsFolder0, arguments);
};

VideoRepository.prototype.registerYearsFolder0 = function(parentItem, itemData,
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

    debug("Register years folder in #", parentItem.id);

    self.newVirtualContainer(parentItem, byYearsLabel, function(error,
        byYearsItem) {
      if (error) {
        return callback(error);
      }

      self.registerYear(byYearsItem, itemData, year, callback);
    });
  });
};

VideoRepository.prototype.registerYear = function(parentNode, itemData, year,
    callback) {

  sync(this, this.registerYear0, arguments);
};

VideoRepository.prototype.registerYear0 = function(parentItem, itemData, year,
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

    debug("Register year on #", parentItem.id, "year=", year);

    self.newVirtualContainer(parentItem, year, MovieActor.UPNP_CLASS, null,
        function(error, yearItem) {
          if (error) {
            return callback(error);
          }

          self.registerMovie(yearItem, itemData.title, itemData, callback);
        });
  });
};
