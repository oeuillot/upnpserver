/*jslint node: true, nomen: true, esversion: 6, maxlen: 180 */
"use strict";

const http        = require('http');
const util        = require('util');
const async       = require("async");
const Path        = require('path');
const fs          = require('fs');
const mkdirp      = require('mkdirp');

const debug       = require('debug')('upnpserver:repositories:IceCast');
const logger      = require('../logger');

const Repository  = require('./repository');
const ContentDirectoryService = require('../contentDirectoryService');
const Item        = require('../class/object.item');
const MusicGenre  = require('../class/object.container.genre.musicGenre');
const AudioBroadcast = require('../class/object.item.audioItem.audioBroadcast');

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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 5.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.124 Safari/537.36';

const ICECAST_API = {
    hostname: 'api.include-once.org',
    path: '/xiph/cache.php',
    headers: {
      'Connection': 'keep-alive',
      'user-agent': USER_AGENT,
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
};
const ICECAST_CACHE_PATH     = Path.join(__dirname, "..", "..", ".cache");
const ICECAST_CACHE          = "playlist.json";
const ICECAST_UPDATE_DELAY   = 6*60*60*1000; // update stations every 6 hours
const ICECAST_GENRE_MAX_OCCURENCES = 64;

class IceCastRepository extends Repository {

  constructor(mountPath, configuration) {
    super(mountPath, configuration);

    this._cachePath = configuration.cachePath || ICECAST_CACHE_PATH;
    this._cacheName = configuration.cacheName || ICECAST_CACHE;
    this._updateDelay = configuration.updateDelay || ICECAST_UPDATE_DELAY;
    this._maxGenreOccurences = configuration.maxGenreOccurences || ICECAST_GENRE_MAX_OCCURENCES;
  }

  get type() {
    return "icecast";
  }

  /**
   * 
   */
  initialize(service, callback) {
    this.unknown_genre = service.upnpServer.configuration.i18n.UNKNOWN_GENRE;

    this.nextUpdate = Date.now() + this._updateDelay;
    this.dirty = false;

    debug("Initialize IceCast");

    var scan = (root, callback) => {
      debug("initialize", "Scan root=#", root.id);

      this.scan((error, list) => {
        if (error) {
          return callback(error);
        }

        debug("initialize", "Scan root=#", root.id, "returns list=",list);

        this.update(root, list, (error) => {
          if (error) {
            return callback(error);
          }

          callback(null, root);
        });
      });
    };

    super.initialize(service, (error, root) => {
      if (error) {
        return callback(error);
      }

      setInterval(() => {
        var now = Date.now();

        if (now < this.nextUpdate){
          return;
        }

        this.nextUpdate = now + this._updateDelay;
        this.dirty = true;

        // clean up children
        debug("initialize", "start update now=", now, "nextUpdate=", this.nextUpdate);
        scan(root, (error) => {
          if (error) {
            logger.error(error);
          }
          debug("initialize", "scan done");
        });

      }, this._updateDelay);


      setImmediate(() => {
        scan(root, (error) => {
          if (error) {
            logger.error("Can not get iceCast data", error);
          } else {
            logger.info("IceCast ready");
          }

          callback();
        });
      });
    });
  }

  /**
   * 
   */
  createBroadcastItem(item, genres){
    if (!genres.length) {
      genres.push(this.unknown_genre);
    }

    return {
      externalContentURL: item.listen_url,
      title:      item.stream_name,
      date:       Date.now(),        

      genres:     genres,

      res: [ {
        bitrate:    item.bitrate,
        mimeType:       item.type || "audio/mp3",
//        size:       -1
      }
      ]
    };
  }

  /**
   * 
   */
  _parsePlaylist(body, callback) {

    if ((/DOCTYPE HTML/g).test(body)){
      // skip parsing when server respond with 403 Forbidden
      var error=new Error("Error in IceCastRepository parsePlaylist : body is not a valid json content (DOCTYPE HTML)");
      logger.error(error);
      return callback(error);
    }

    var playlist = JSON.parse(body);
    // console.log("****** parsePlaylist : success *******");
    playlist.sort((a, b) => {
      if (a.stream_name < b.stream_name) return 1;
      if (a.stream_name > b.stream_name) return -1;
      return 0;
    });

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
       
      media.genres = [];

      genre = genre.trim();
      if (!genre || genre==="unspecified") {
        return prev;
      }
      
      if (/\s/.test(genre)){
        genre.split(' ').forEach((cur) => {
          if (!cur) {
            return;
          }
          if (prev[cur]) {
            prev[cur]++;
            
          } else {
            prev[cur] = 1;
          }
          media.genres.push(cur);
        });
        return prev;
      }

      if(prev[genre]) {
        prev[genre] ++;
      } else {
        prev[genre] = 1;
      }
      media.genres.push(genre);

      return prev;
    }, {});

    // filter genres > 50 occurences
    playlist = playlist.map((media) => {
      var g = media.genres.filter((genre) => (genres[genre] > this._maxGenreOccurences));

      return this.createBroadcastItem(media,g);
    });
    return playlist;
  }

  /**
   * 
   */
  getNodeList(parent, callback) {

    parent.filterChildNodes((node) => {
      if (node.refId) {
        // Ignore references
        return false;
      }
      return node.upnpClass && node.upnpClass.isSubClassOf(AudioBroadcast.UPNP_CLASS);

    }, callback);
  }

  /**
   * 
   */
  nodesToAdd(nodes, files){
    var oldURLs = nodes.map((node) => node.attributes.externalContentURL);
    
    // add files only when url are not found within current nodes set
    var nodesToAdd = files.filter((file) => {
      return oldURLs.indexOf(file.externalContentURL) < 0;
    });
    debug("nodesToAdd", "nodes count=",nodesToAdd.length,
        " Nodes urls count=",oldURLs.length,
        " Nodes count=", nodes.length);
    // console.log(util.inspect(filesToAdd));
    return nodesToAdd;
  }

  /**
   * 
   */
  nodesToRemove(nodes, files){
    var newURLs = files.map(attr => attr.externalContentURL);
    // remove nodes not found in files
    var nodesToRemove = nodes.filter((node) => {
      return newURLs.indexOf(node.attributes.externalContentURL) < 0;
    });

    debug("nodesToRemove", "nodes count=",nodes.length,
        " nodesToRemove count =",nodesToRemove.length,
        " files urls count=",newURLs.length,
        " files count=", files.length);
    // console.log(util.inspect(nodesToRemove));
    return nodesToRemove;
  }

  /**
   * 
   */
  update(root, list, callback) {
    debug("update", "Update root=#", root.id, "list=",list);

    this.getNodeList(root, (error, broadcastNodes) => {
      debug("update", "broadcastNodes=", broadcastNodes, "error=",error);
      
      if (error) {
        return callback(error);
      }

      var nodesToRemove = this.nodesToRemove(broadcastNodes, list);
      var nodesToAdd = this.nodesToAdd(broadcastNodes, list);

      async.series({

        remove: (callback) => {
          async.eachLimit(nodesToRemove, FILES_PROCESSOR_LIMIT, (child, callback) => {
            child.getParentNode((err, parent) => {
              if (err) {
                return callback(err);
              }
              parent.removeChild(child, callback);
            });
          }, (error) => {
            if (error) {
              logger.error("Error while removing nodes ", error);
              return callback(error);
            }
            debug("update", nodesToRemove.length, "nodes removed");

            callback(null, true);
          });
        },

        add: (callback) => {
          async.eachLimit(nodesToAdd, FILES_PROCESSOR_LIMIT, (infos, callback) => {
            this.addAudioBroadcast(root, infos, (error) => {
              if (error) {
                logger.error("Process file node=#" + root.id + " infos=", infos,
                    " error=", error);
              }

              setImmediate(callback);
            });

          }, (error) => {
            if (error) {
              logger.error("Error while scaning files ", error);
              return callback(error);
            }

            debug("update", nodesToAdd.length , "files processed");
            callback(null, true);
          });
        }
      },
      (error) => {
        callback(error);
      });
    });
  }

  /**
   * 
   */
  scan(callback) {
    debug("scan", "loading broadcast items");

    var cacheFilename=Path.join(this._cachePath, this._cacheName);
    debug("scan", "Cache path=",cacheFilename);

    mkdirp(this._cachePath, (error) => {
      if (error) {
        return callback(error);
      }

      fs.stat(cacheFilename, (err, stats) => {
        debug("scan", "Stat error=",err, "stats=",stats, "updateDelay=", this._updateDelay);
        var now = Date.now();

        // !this.dirty
        if (!err && stats.isFile() && (stats.mtime.getTime() + this._updateDelay >  now)){
          debug("read cache file");
          fs.readFile(cacheFilename, (error, body) => {
            if (err) {
              return callback(err);
            }

            debug("scan", "load cache content=",body);

            var files = this._parsePlaylist(body);
            callback(null, files);
          });
          return;
        }

        debug("request iceCast list from online server");
        var req = http.request(ICECAST_API, (res) => {
          var body = "";
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            debug("scan", "save cache file body=",body);
            fs.writeFile(cacheFilename, body, (err) => {
              if (err) {
                return callback(err);
              }

              var files = this._parsePlaylist(body);
              callback(err, files);
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
    var mimeType = infos.mimeType;
    var mimePart = mimeType.split("/");

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
  addAudioBroadcast(parentNode, attributes, callback) {

    var i18n = this.service.upnpServer.configuration.i18n;

    var itemData=Object.assign({}, attributes, {
        title: attributes.title || i18n.UNKNOWN_TITLE,
    });
    var genres=attributes.genres || [ i18n.UNKNOWN_GENRE ];
    
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

      task.fn.call(this, parentNode, itemData, task.param, callback);

    }, (error) => {

      if (error) {
        return callback(error);
      }

      callback();
    });
  }

  /**
   * 
   */
  registerAudioBroadcast(parentNode, itemData, callback) {

    if (itemData.node) {
      debug("registerAudioBroadcast", "Link title on #", parentNode.id, "title=", itemData.name);

      return this.newNodeRef(parentNode, itemData.node, callback);
    }
    
    var attributes = {
        externalContentURL: itemData.externalContentURL,
        
        res: itemData.res
    };
    
    debug("registerAudioBroadcast", "New audio broadcast node attributes=",attributes);
    
    this.service.newNode(parentNode, itemData.title, AudioBroadcast.UPNP_CLASS, attributes, (node) => {

    }, null, (error, node) => {
      if (error) {
        return callback(error);
      }
      
      itemData.node=node;
      
      callback(null, node);
    });
  }

  /**
   * 
   */
  registerGenresFolder(parentNode, itemData, genreName, callback) {

    parentNode.getFirstVirtualChildByTitle(genreName, (error, genreItem) => {
      if (error) {
        return callback(error);
      }
      
      if (genreItem) {
        debug("registerGenresFolder", "getFirstVirtualChildByTitle returns=#", genreItem.id);

        return this.registerAudioBroadcast(genreItem, itemData, callback);
      }

      debug("registerGenresFolder", "getFirstVirtualChildByTitle title not fount (", genreName, ")");

      this.newVirtualContainer(parentNode, genreName, MusicGenre.UPNP_CLASS, (error, genreItem) => {

        if (error) {
          return callback(error);
        }

        this.registerAudioBroadcast(genreItem, itemData, callback);
      });
    });
  }
}

module.exports=IceCastRepository;
