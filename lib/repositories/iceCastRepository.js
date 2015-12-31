/*jslint node: true, plusplus: true, nomen: true, vars: true, esversion: 6 */
"use strict";
const http        = require('http');
const   sys         = require('sys');
const   util        = require('util');
const   async       = require("async");
const  path        = require('path');
const  fs          = require('fs');
const   Semaphore   = require('semaphore');
const   debug       = require('debug')('upnpserver:repository:IceCast');
const   logger      = require('../logger');
const   Repository  = require('./repository');
const   ContentDirectoryService = require('../contentDirectoryService');
const   Item        = require('../class/object.item');
const   MusicGenre  = require('../class/object.container.genre.musicGenre');
const   AudioBroadcast = require('../class/object.item.audioItem.audioBroadcast');

const FILES_PROCESSOR_LIMIT = 25;

/**
 * IceCast
 * Find online icecast list (currently 10k +) via (unofficial) json API
 * Sort stations by genre
 * Update list of stations every 6 hour
 * Update upnp broadcasts.items only when needed
 *   by killing dead stations and adding new ones
 *
 * TODO: move this in config files
 * "http://api.include-once.org/xiph/cache.php";
 * user-agent is needed here to prevent 403 responses
 */

const ICECAST_API = {
    hostname: 'api.include-once.org',
    path: '/xiph/cache.php',
    headers: {
      'Connection':   'keep-alive',
      'user-agent': 'Mozilla/5.0 (Windows NT 5.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.124 Safari/537.36',
      'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
};
const ICECAST_CACHE_PATH     = path.resolve(__dirname + "../../../cache/");
const ICECAST_CACHE          = ICECAST_CACHE_PATH + "/playlist.json";
const ICECAST_UPDATEDELAY = 6*60*60*1000; // update stations every 6 hours

class IceCastRepository extends Repository {
  constructor(repositoryId, mountpath, searchClasses) {

    super(repositoryId, mountpath, searchClasses);

    this._scannerSemaphore = Semaphore(1);
  }

  /**
   * 
   */
  initialize(service, callback) {

    this.contentDirectoryService = service;

    this.unknown_genre = service.upnpServer.configuration.i18n.UNKNOWN_GENRE;

    var log = false;
    this.nextUpdate = Date.now()+ICECAST_UPDATEDELAY;
    this.dirty = false;

    logger.info("Initialize IceCast");

    var scan = (root, nodes, callback) => {
      this.scan(root, nodes, (err, root, list, chidrens) => {
        this.update(err, root, list, chidrens, (err) => {
          if (err) logger.error(err);
          if (callback) {
            logger.info("IceCast ready");
            callback(null, root);
          }
        });
      });
    };

    super.initialize(service, (error, root) => {
      if (error) {
        return callback(error);
      }


      setInterval(() => {
        var now = new Date().getTime();
        if (now > this.nextUpdate){
          this.nextUpdate = now+ICECAST_UPDATEDELAY;
          this.dirty = true;
          // clean up childs
          debug("start update");
          this.getNodeList(root, null, (err, list) => scan(root, list));
          /*
                node._garbageChild(function(err){
                    if (err) return logger.error(err);
                    // then rebuild chils
                    scan();
                });
           */
        }
      }, ICECAST_UPDATEDELAY);


      setImmediate(() => {
        scan(root, [], callback);
      });

    });
  }

  /**
   * 
   */
  createBroadcastItem(item, genres){
    if (genres.length < 1)
      genres.push(this.unknown_genre);
    return {
      externalContentURL: item.listen_url,
      mime:       item.type || "audio/mp3",
      title:      item.stream_name,
      date:       Date.now(),        

      genres:     genres,

      res: [ {
        bitrate:    item.bitrate,
        size:       -1
      }
      ]
    };
  }

  /**
   * 
   */
  _parsePlaylist(body, callback){

    // sort streams by name
    function sortByName(a, b){
      if (a.stream_name < b.stream_name) return 1;
      if (a.stream_name > b.stream_name) return -1;
      return 0;
    }

    if ((/DOCTYPE HTML/g).test(body)){
      // skip parsing when server respond with 403 Forbidden
      logger.error("Error in IceCastRepository parsePlaylist : body is not a valid json content (DOCTYPE HTML)");
      return false;
    }

    var playlist = JSON.parse(body);
    // console.log("****** parsePlaylist : success *******");
    playlist.sort(sortByName);

    // Parse genres, store occurences
    var genres = playlist.reduce((prev, media) => {
      var genre = media.genre.replace(/'s/g," ")
      .replace(/-/g,'_')
      .replace(/([0-9]+)(er|s)/g,"$1")
      .replace(/(^|[\s\t]+)[A-Za-z0-9]([\s\t]+|$)/g,' ')
      .replace(/(\.)/g,' ')
      .replace(/(^|[\s\t]+)mutch([\s\t]+|$)/g,' ')
      .replace(/(^|[\s\t]+)more([\s\t]+|$)/g,' ')
      .replace(/(^|[\s\t]+)and([\s\t]+|$)/g,' ')
      .replace(/(^|[\s\t]+)the([\s\t]+|$)/g,' ')
      .replace(/(^|[\s\t]+)by([\s\t]+|$)/g,' ');

      //  console.log(cur.genre+'  =  '+genre);
      media.genres = [];
      if (genre.trim() === "") return prev;
      if (/\s/.test(genre)){
        genre.split(' ').forEach((cur) => {
          cur = cur.trim();
          if (cur !== ""){
            if(prev[cur]) prev[cur] += 1;
            else prev[cur] = 1;
            media.genres.push(cur);
          }
        });
      }
      else {
        genre = genre.trim();
        if (genre !== "")
          if(prev[genre]) prev[genre] += 1;
          else prev[genre] = 1;
        media.genres.push(genre);
      }
      return prev;
    }, {});

    // filter genres > 50 occurences
    playlist = playlist.map((media) => {
      var g = media.genres.filter((genre) => (genres[genre] > 50));

      return this.createBroadcastItem(media,g);
    });
    return playlist;
  }

  /**
   * 
   */
  getNodeList(parent, list, callback) {

    function filter(parent){
      return parent.refID || parent.upnpClass && parent.upnpClass.name === "object.item.audioItem.audioBroadcast";
    }
    parent.filterChildNodes(parent, list, filter, callback);

  }

  /**
   * 
   */
  filesToAdd(nodes, files){
    var oldURLs = nodes.reduce((all, node) => {
      if (node.refID) return all;
      all.push(node.attributes.externalContentURL);
      return all;
    }, []);
    // add files only when url are not found within current nodes set
    var filesToAdd      = files.filter((file) => {
      return oldURLs.indexOf(file.externalContentURL) < 0;
    });
    debug("fileToAdd count :",filesToAdd.length,
        " Nodes urls count :",oldURLs.length,
        " Nodes count", nodes.length);
    // console.log(util.inspect(filesToAdd));
    return filesToAdd;
  }

  /**
   * 
   */
  refsToRemove(nodes, toRemove){
    var idsToRemove = toRemove.map((node) => node.id);
    var refsToRemove = nodes.filter((node) => {
      return node.refID && idsToRemove.indexOf(node.refID) > -1;
    });
    return refsToRemove;
  }

  /**
   * 
   */
  nodesToRemove(nodes, files){
    var newURLs = files.map(attr => attr.externalContentURL);
    // remove nodes not found in files
    var nodesToRemove   = nodes.filter((node) => {
      return !node.refID && newURLs.indexOf(node.attributes.externalContentURL) < 0;
    });
    debug("nodes count:",nodes.length,
        " nodesToRemove count :",nodesToRemove.length,
        " files urls count :",newURLs.length,
        " files count", files.length);
    // console.log(util.inspect(nodesToRemove));
    return nodesToRemove;
  }

  /**
   * 
   */
  update(err, root, list, childs, callback){

    if (err){
      return callback(err);
    }
    var nodes = this.nodesToRemove(childs, list);
    var refs = this.refsToRemove(childs, nodes);
    var files = this.filesToAdd(childs, list);

    async.series({
      add: (next) => {
        async.eachLimit(files, FILES_PROCESSOR_LIMIT, (infos, callback) => {
          this.processFile(root, infos, (error) => {
            if (error) {
              logger.error("Process file node=#" + root.id + " infos=", infos,
                  " error=", error);
            }

            setImmediate(callback);
          });

        }, (error) => {
          if (error) {
            logger.error("Error while scaning files ", error);
            return next(error);
          }
          debug(files.length , "files processed");

          next(null, true);
        });

      },
      refs: (next) => {
        async.eachLimit(refs, FILES_PROCESSOR_LIMIT, (child, callback) => {
          child.getParent((err, parent) => {
            if (err) return callback(err);
            parent.removeChild(child, callback);
          });
        }, (error) => {
          if (error) {
            logger.error("Error while removing nodes ", error);
            return next(error);
          }
          debug(refs.length , "refs removed");

          next(null, true);
        });
      },
      remove: (next) => {

        async.eachLimit(nodes, FILES_PROCESSOR_LIMIT, (child, callback) => {
          child.getParent((err, parent) => {
            if (err) return callback(err);
            parent.removeChild(child, callback);
          });
        }, (error) => {
          if (error) {
            logger.error("Error while removing nodes ", error);
            return next(error);
          }
          debug(nodes.length, "nodes removed");

          next(null, true);
        });

      }
    },
    (err) => {
      callback(err);
    });
  }

  /**
   * 
   */
  ensureExists(path, mask, cb) {
    if (typeof mask == 'function') { // allow the `mask` parameter to be optional
      cb = mask;
      mask = 777;
    }
    fs.mkdir(path, mask, (err) => {
      if (err) {
        if (err.code == 'EEXIST') return cb(null); // ignore the error if the folder already exists
        return cb(err); // something else went wrong
      } 
      cb(null); // successfully created folder
    });
  }

  /**
   * 
   */
  scan(root, nodes, callback) {
    this.ensureExists(ICECAST_CACHE_PATH, 755, () => {
      fs.stat(ICECAST_CACHE, (err, stats) => {

        var now = new Date().getTime();
        if (!this.dirty && !err && stats.isFile() && (stats.mtime.getTime() + ICECAST_UPDATEDELAY <  now)){
          debug("read cache file");
          fs.readFile(ICECAST_CACHE, (err, body) => {
            if (err) return callback(err);
            var files = this._parsePlaylist(body);
            callback(err, root, files, nodes);
          });
          return;
        }

        debug("request iceCast list from online server");
        var req = http.request(ICECAST_API, (res) => {
          var body = "";
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            debug("save cache file");
            fs.writeFile(ICECAST_CACHE, body, (err, res) => {
              if (err) return callback(err);
              var files = this._parsePlaylist(body);
              callback(err, root, files, nodes);

            });
          });
        });
        req.on('error', (err) => {
          logger.error(err);
          callback(err);
        });
        req.end();          

      });
    });
  }

  /**
   * 
   */
  keepFile(infos) {
    var mime = infos.mime;
    var mimePart = mime.split("/");

    if (mimePart.length !== 2 || mimePart[0] !== "audio") {
      return false;
    }

    if (mimePart[1] === "x-mpegurl") {
      return false; // Dont keep .m3u
    }

    return true;
  }

  /**
   * 
   */
  processFile(rootItem, attributes, callback) {

    var i18n = this.contentDirectoryService.upnpServer.configuration.i18n;

    var name = attributes.title;
    var semaphore = this._scannerSemaphore;

    this.contentDirectoryService.createNode(name, AudioBroadcast.UPNP_CLASS, attributes, (error, node) => {
      if (error) {
        return callback(error);
      }

      node.getAttributes(ContentDirectoryService.MED_PRIORITY, (error, attributes) => {

        semaphore.take(() => {

          //  console.log(util.inspect(attributes));

          var title  = attributes.title || node.name || i18n.UNKNOWN_TITLE;
          var genres = attributes.genres || [ i18n.UNKNOWN_GENRE ];

          var itemData = {
              node : node,

              title : title,
              genres : genres
          };

          var tasks = [];

          if (genres) {
            genres.forEach((genre) => {
              if (!genre) {
                // genre = i18n.UNKNOWN_GENRE;
                return;
              }
              genre = genre.trim();
              tasks.push({
                fn : this.registerGenresFolder,
                param : genre
              });
            });
          }

          async.eachSeries(tasks, (task, callback) => {

            task.fn.call(this, rootItem, itemData, task.param, callback);

          }, (error) => {
            semaphore.leave();

            if (error) {
              return callback(error);
            }

            callback();
          });

        });
      });
    });
  }

  /**
   * 
   */
  registerAudioBroadcast(parentItem, itemData, tryCount, callback) {

    var t = itemData.title;
    if (tryCount) {
      t += "  #" + (tryCount) + "";
    }

    parentItem.getChildByName(t, (error, audioBroadcast) => {
      if (error) {
        return callback(error);
      }

      debug("Find '" + t + "' in #" + parentItem.id + " => " + audioBroadcast);

      if (audioBroadcast) {
        audioBroadcast.resolveLink((error, mu) => {
          if (mu.attributes.externalContentURL === itemData.externalContentURL) {
            itemData.audioBroadcast = mu;

            return callback(null, mu);
          }

          debug("Register title on " + parentItem.id + " title=" + t);

          this.registerAudioBroadcast(parentItem, itemData, tryCount + 1, callback);
        });
        return;
      }

      if (itemData.audioBroadcast) {

        debug("Link title on " + parentItem.id + " title=" + t);

        return this.newNodeRef(parentItem, itemData.audioBroadcast, null,
            callback);
      }

      if (itemData.node) {
        parentItem.appendChild(itemData.node, (error) => {
          if (error) {
            return callback(error);
          }

          itemData.audioBroadcast = itemData.node;
          delete itemData.node;

          callback(null, itemData.audioBroadcast);
        });
        return;
      }

      throw new Error("Never happen ! " + util.inspect(itemData));
    });
  }

  /**
   * 
   */
  registerGenresFolder(parentItem, itemData,   genreName, callback) {

    parentItem.getChildByName(genreName, (error, genreItem) => {
      if (error) {
        return callback(error);
      }

      if (genreItem) {
        return this.registerAudioBroadcast(genreItem, itemData, 0, callback);
      }

      this.newVirtualContainer(parentItem, genreName, MusicGenre.UPNP_CLASS, null, (error, genreItem) => {

        if (error) {
          return callback(error);
        }

        this.registerAudioBroadcast(genreItem, itemData, 0, callback);
      });
    });
  }
}

module.exports=IceCastRepository;
