/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

/**
 * 
 *  @author s-leger ( https://github.com/s-leger )
 */

var http = require('http');
var sys = require('sys');
var Util = require('util');
var Async = require("async");
var Path = require('path');
var fs = require('fs');
var Semaphore = require('semaphore');
var debug = require('debug')('upnpserver:IceCastRepository');
var logger = require('../logger');
var Repository = require('./repository');
var ContentDirectoryService = require('../contentDirectoryService');
var Item = require('../class/object.item');
var MusicGenre = require('../class/object.container.genre.musicGenre');
var AudioBroadcast = require('../class/object.item.audioItem.audioBroadcast');

var FILES_PROCESSOR_LIMIT = 25;

/**
 * IceCast (unofficial) json API 
 * TODO: move this in config files const API_URL = "http://api.include-once.org/xiph/cache.php";
 * user-agent is needed here to prevent 403 responses
 */
var ICECAST_API = {
  hostname : 'api.include-once.org',
  path : '/xiph/cache.php',
  headers : {
    'Connection' : 'keep-alive',
    'user-agent' : 'Mozilla/5.0 (Windows NT 5.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.124 Safari/537.36',
    'Accept' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  }
};

var ICECAST_CACHE = Path.resolve(__dirname + "../../../cache/playlist.json");
var ICECAST_UPDATEDELAY = 6 * 60 * 60 * 1000; // update stations every 6 hours

var IceCastRepository = module.exports = function(repositoryId, mountPath,
    searchClasses) {

  Repository.call(this, repositoryId, mountPath, searchClasses);

  this._scannerSemaphore = Semaphore(1);
};

Util.inherits(IceCastRepository, Repository);

IceCastRepository.prototype.initialize = function(service, callback) {

  this.contentDirectoryService = service;

  var self = this;
  var log = false;
  self.nextUpdate = Date.now() + ICECAST_UPDATEDELAY;
  self.dirty = false;

  function scan(node) {
    self.scan(service, node, function(error) {
      if (error) {
        logger.error("IceCastRepository: Scan error", error);
        return;
      }

      if (!log) {
        return;
      }

      node.treeString(function(error, string) {
        if (error) {
          logger.error("IceCastRepository: Tree string error", error);
          return;
        }
        logger.debug(string);
      });
    });

  }

  Repository.prototype.initialize.call(this, service, function(error, node) {
    if (error) {
      return callback(error);
    }

    setInterval(function() {
      var now = Date.now();
      if (now > self.nextUpdate) {
        self.nextUpdate = now + ICECAST_UPDATEDELAY;
        self.dirty = true;
        // clean up childs
        debug("start garbage");
        node._garbageChild(function(err) {
          if (err)
            return logger.error(err);
          // then rebuild chils
          scan(node);
        });
      }
    }, ICECAST_UPDATEDELAY);

    setImmediate(function() {
      scan(node);
    });

    callback(null, node);
  });
};

IceCastRepository.prototype._parsePlaylist = function(body, callback) {

  var self = this;

  // sort streams by name
  function sortByName(a, b) {
    if (a.stream_name < b.stream_name) {
      return 1;
    }
    if (a.stream_name > b.stream_name) {
      return -1;
    }
    return 0;
  }

  if ((/DOCTYPE HTML/g).test(body)) {
    // skip parsing when server respond with 403 Forbidden
    logger
        .error("Error in IceCastRepository parsePlaylist : body is not a valid json content (DOCTYPE HTML)");
    return false;
  }

  var playlist = JSON.parse(body);
  // console.log("****** parsePlaylist : success *******");
  playlist.sort(sortByName);

  // fs.writeFile(__dirname+'/icecast.m3u', playlist,function(err,res){});
  function createBroadcastItem(item, genres) {
    return {
      externalContentURL : item.listen_url,
      genres : genres,
      bitrate : item.bitrate,
      mime : item.type,
      title : item.stream_name,
      date : Date.now(),
      size : -1
    };
  }
  // Parse genres, store occurences
  var genres = playlist.reduce(function(prev, media) {
    var genre = media.genre.replace(/'s/g, " ").replace(/-/g, '_').replace(
        /([0-9]+)(er|s)/g, "$1").replace(/(^|[\s\t]+)a([\s\t]+|$)/g, ' ')
        .replace(/(^|[\s\t]+)b([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)d([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)n([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)r([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)u([\s\t]+|$)/g, ' ').replace(/(\.)/g, ' ').replace(
            /(^|[\s\t]+)y([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)mutch([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)more([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)and([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)the([\s\t]+|$)/g, ' ').replace(
            /(^|[\s\t]+)by([\s\t]+|$)/g, ' ');

    // console.log(cur.genre+' = '+genre);
    media.genres = [];
    if (genre.trim() === "")
      return prev;
    if (/\s/.test(genre)) {
      genre.split(' ').forEach(function(cur) {
        cur = cur.trim();
        if (cur !== "") {
          if (prev[cur])
            prev[cur] += 1;
          else
            prev[cur] = 1;
          media.genres.push(cur);
        }
      });
    } else {
      genre = genre.trim();
      if (genre !== "")
        if (prev[genre])
          prev[genre] += 1;
        else
          prev[genre] = 1;
      media.genres.push(genre);
    }
    return prev;
  }, {});

  // filter genres > 50 occurences
  playlist = playlist.map(function(media) {
    var g = media.genres.filter(function(genre) {
      return (genres[genre] > 50);
    });
    return createBroadcastItem(media, g);
  });
  return playlist;
};

IceCastRepository.prototype.scan = function(service, node, callback) {
  var self = this;

  fs.stat(ICECAST_CACHE, function(err, stats) {

    var now = Date.now();
    if (!self.dirty && !err && stats.isFile() &&
        (stats.mtime.getTime() + ICECAST_UPDATEDELAY < now)) {
      debug("read cache file");
      fs.readFile(ICECAST_CACHE, function(err, body) {
        if (err) {
          return logger.error(err);
        }
        
        var files = self._parsePlaylist(body);
        Async.eachLimit(files, FILES_PROCESSOR_LIMIT,
            function(infos, callback) {
              self.processFile(node, infos, function(error) {
                if (error) {
                  logger.error("Process file node=#" + node.id + " infos=",
                      infos, " error=", error);
                }

                setImmediate(callback);
              });

            }, function(error) {
              if (error) {
                logger.error("Error while scaning files ", error);
                return callback(error);
              }

              debug(files.length + " files processed");

              setImmediate(callback);
            });
      });

    } else {
      debug("request iceCast list from online server");
      var req = http.request(ICECAST_API, function(res) {
        var body = "";
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
          body += chunk;
        });
        res.on('end', function() {
          debug("save cache file");
          fs.writeFile(ICECAST_CACHE, body, function(err, res) {
            if (err)
              return logger.error(err);

            var files = self._parsePlaylist(body);

            Async.eachLimit(files, FILES_PROCESSOR_LIMIT, function(infos,
                callback) {
              self.processFile(node, infos, function(error) {
                if (error) {
                  logger.error("Process file node=#" + node.id + " infos=",
                      infos, " error=", error);
                }

                setImmediate(callback);
              });

            }, function(error) {
              if (error) {
                logger.error("Error while scaning files ", error);
                return callback(error);
              }

              if (debug.enabled) {
                debug(files.length + " files processed");
              }

              setImmediate(callback);
            });
          });
        });
      });
      req.on('error', function(err) {
        logger.error(err);
      });
      req.end();
    }
  });
};

IceCastRepository.prototype.keepFile = function(infos) {
  var mime = infos.mime;
  var mimePart = mime.split("/");

  if (mimePart.length !== 2 || mimePart[0] !== "audio") {
    return false;
  }

  if (mimePart[1] === "x-mpegurl") {
    return false; // Dont keep .m3u
  }

  return true;
};

IceCastRepository.prototype.processFile = function(rootItem, attributes,
    callback) {

  var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

  var self = this;

  var name = attributes.title;
  var semaphore = this._scannerSemaphore;

  this.contentDirectoryService.createNode(name, AudioBroadcast.UPNP_CLASS,
      attributes, function(error, node) {
        if (error) {
          // semaphore.leave();
          return callback(error);
        }

        node.getAttributes(ContentDirectoryService.MED_PRIORITY, function(
            error, attributes) {
          // console.log("Attributes of #" + node.id, attributes);

          semaphore.take(function() {

            var title = attributes.title || node.name || i18n.UNKNOWN_TITLE;
            var genres = attributes.genres || [ i18n.UNKNOWN_GENRE ];

            var itemData = {
              node : node,

              title : title,
              genres : genres
            };

            var tasks = [];

            if (genres) {
              genres.forEach(function(genre) {
                if (!genre) {
                  // genre = i18n.UNKNOWN_GENRE;
                  return;
                }
                genre = genre.trim();
                tasks.push({
                  fn : self.registerGenresFolder,
                  param : genre
                });
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
};

IceCastRepository.prototype.registerAudioBroadcast = function(parentItem,
    itemData, tryCount, callback) {

  var t = itemData.title;
  if (tryCount) {
    t += "  (#" + (tryCount) + ")";
  }

  var self = this;
  parentItem.getChildByName(t, function(error, audioBroadcast) {
    if (error) {
      return callback(error);
    }

    if (debug.enabled) {
      debug("Find '" + t + "' in #" + parentItem.id + " => " + audioBroadcast);
    }

    if (audioBroadcast) {
      audioBroadcast.resolveLink(function(error, mu) {
        if (mu.attributes.contentURL === itemData.contentURL) {
          itemData.audioBroadcast = mu;

          return callback(null, mu);
        }

        if (debug.enabled) {
          debug("Register title on " + parentItem.id + " title=" + t);
        }

        self.registerAudioBroadcast(parentItem, itemData, tryCount + 1,
            callback);
      });
      return;
    }

    if (itemData.audioBroadcast) {
      if (debug.enabled) {
        debug("Link title on " + parentItem.id + " title=" + t);
      }

      return self.newNodeRef(parentItem, itemData.audioBroadcast, null,
          callback);
    }

    if (itemData.node) {
      parentItem.appendChild(itemData.node, function(error) {
        if (error) {
          return callback(error);
        }

        itemData.audioBroadcast = itemData.node;
        delete itemData.node;

        callback(null, itemData.audioBroadcast);
      });
      return;
    }

    throw new Error("Never happen ! " + Util.inspect(itemData));
  });
};

IceCastRepository.prototype.registerGenresFolder = function(parentItem,
    itemData, genreName, callback) {

  var self = this;
  parentItem.getChildByName(genreName, function(error, genreItem) {
    if (error) {
      return callback(error);
    }

    if (genreItem) {
      return self.registerAudioBroadcast(genreItem, itemData, 0, callback);
    }

    self.newVirtualContainer(parentItem, genreName, MusicGenre.UPNP_CLASS,
        null, function(error, genreItem) {

          if (error) {
            return callback(error);
          }

          self.registerAudioBroadcast(genreItem, itemData, 0, callback);
        });
  });
};