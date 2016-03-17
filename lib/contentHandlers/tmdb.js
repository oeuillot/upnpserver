/*jslint node: true, esversion: 6 */
"use strict";

const Path = require('path');
const async = require('async');

const debug = require('debug')('upnpserver:contentHandlers:tmdb');
const logger = require('../logger');

const MetasJson = require('./metas.json');

class tmdb extends MetasJson {
  constructor(configuration) {
    super(configuration);
  }

  get name() {
    return "tmdb";
  }

  _processFile(contentInfos, context, path, json, callback) {
    debug("_processFile", "Process file",path,"json=",json);

    var tmdb = json['themoviedb.org'];
    if (!tmdb || tmdb.type!=="tv" || !tmdb.tvInfo) {
      return callback();
    }
    
    var contentProvider = contentInfos.contentProvider;
    var tvInfo = tmdb.tvInfo;
   
    var season;
    var episode;
    var reg=/[^A-Z]S([\d{1,}])[-_ ]*E([\d{1,}])/i.exec(contentInfos.contentURL);
    if (reg) {
      season = parseInt(reg[1], 10);
      episode = parseInt(reg[2], 10);

    } else {
      reg=/[^A-Z]E([\d{1,}])/i.exec(contentInfos.contentURL);
      if (!reg) {
        debug("_processFile", "Can not detect season and episode name=",contentInfos.contentURL);
        return callback();
      }
      season = 0;
      episode = parseInt(reg[1], 10);
    }
    
    
    debug("_processFile", "Detected numbers season=",season,"episode=",episode);
   
    var seasonJson = (tvInfo.seasons || []).find((s) => s.season_number===season);
    debug("_processFile", "SeasonJson=", seasonJson);
    if (!seasonJson) {
      return callback();
    }

    var episodeJson = (seasonJson.episodes || []).find((e) => e.episode_number===episode);
    debug("_processFile", "EpisodeJson=", episodeJson);
    if (!episodeJson) {
      return callback();
    }
    

    var metas = {};
    metas.season = episodeJson.season_number;
    metas.episode = episodeJson.episode_number;
    metas.episodeCount = seasonJson.episode_count;    
    
    if (episodeJson.name) {
      metas.title = episodeJson.name;
    }    
    if (episodeJson.overview) {
      metas.longDescription = episodeJson.overview;
    }
    if (episodeJson.air_date) {
      metas.airDate = episodeJson.air_date;
    }

    var statistics = episodeJson.vote_count;
    if (statistics) {
      metas.ratings.push({
        type : "af_user",
        rating : episodeJson.vote_average/2  //  5 stars
      });
    }
    
    var tasks=[];

    if (episodeJson.poster_path) {
      tasks.push((callback) => {
        var posterPath = contentProvider.join(path, '..', 'tmdb', episodeJson.poster_path);
        debug("_processFile", "posterPath=",posterPath);
        
        contentProvider.stat(posterPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate posterPath",posterPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "poster",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=poster",
            mtime: stats.mtime.getTime()
          });

          callback();
        });
      });
    }
 
    if (episodeJson.still_path) {
      tasks.push((callback) => {
        var stillPath = contentProvider.join(path, '..', 'tmdb', episodeJson.still_path);
        debug("_processFile", "stillPath=",stillPath);
        
        contentProvider.stat(stillPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate still_path",stillPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "still",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=still",
            mtime: stats.mtime.getTime()
          });

          callback();
        });
      });
    }

    if (seasonJson.poster_path) {
      tasks.push((callback) => {
        var posterPath = contentProvider.join(path, '..', 'tmdb', seasonJson.poster_path);
        debug("_processFile", "season posterPath=",posterPath);
       
        contentProvider.stat(posterPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate poster path",posterPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "season-poster",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=poster",
            mtime: stats.mtime.getTime()
          });

          callback();
        });
      });
    }
    
    if (tvInfo.poster_path) {
      tasks.push((callback) => {
        var posterPath = contentProvider.join(path, '..', 'tmdb', tvInfo.poster_path);
        debug("_processFile", "serie posterPath=",posterPath);
       
        contentProvider.stat(posterPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate poster path",posterPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "tv-poster",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=poster",
            mtime: stats.mtime.getTime(),
            localPath: tvInfo.poster_path
          });

          callback();
        });
      });
    }
   
    async.series(tasks, (error) => {
      if (error) {
        return callback(error);
      }
      
      callback(null, metas);
    });
  }

  _processFolder(contentInfos, context, path, json, callback) {
    debug("_processFolder", "Process folder",path,"json=",json);
    var tmdb = json['themoviedb.org'];
    if (!tmdb || tmdb.type!=="tv" || !tmdb.tvInfo) {
      debug("_processFolder", "No tmdb", tmdb);
      return callback();
    }
    
    var contentProvider = contentInfos.contentProvider;
    var tvInfo = tmdb.tvInfo;

    var metas = {};
    metas.seasons = tvInfo.number_of_seasons;
    metas.episodes = tvInfo.number_of_episodes;

    var genres = tvInfo.genres;
    if (genres) {
      metas.genres = metas.genres || [];

      genres.forEach((genre) => {
        metas.genres.push({
          id : "tmdb_" + genre.id,
          name : genre.name
        });
      });
    }
    
    var tasks=[];
    
    if (tvInfo.poster_path) {
      tasks.push((callback) => {
        var posterPath = contentProvider.join(path, "..", "tmdb", tvInfo.poster_path);
        debug("_processFolder", "serie posterPath=",posterPath);
       
        contentProvider.stat(posterPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate poster path",posterPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "poster",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=poster",
            mtime: stats.mtime.getTime()
          });

          callback();
        });
      });
    }
    
    if (tvInfo.backdrop_path) {
      tasks.push((callback) => {
        var backdropPath = contentProvider.join(path, "..", "tmdb", tvInfo.backdrop_path);
        debug("_processFolder", "serie backdropPath=",backdropPath);
       
        contentProvider.stat(backdropPath, (error, stats) => {        
          if (error) {
            console.error("Can not locate backdrop path",backdropPath);
            return callback();
          }
          
          metas.res=metas.res || [{}];
          metas.res.push({
            contentHandlerKey : this.name,
            key : "backdrop",
            mimeType : stats.mimeType,
            size : stats.size,
            additionalInfo : "type=backdrop",
            mtime: stats.mtime.getTime()
          });
          
          callback();
        });
      });
    }
    
    async.series(tasks, (error) => {
      if (error) {
        return callback(error);
      }
      
      callback(null, metas);
    });
  }  
  
  _getResourceContentURL(node, type, key, res, callback) {
    debug("_getResourceContentURL", "Get contentURL of key=",key,"node=#",node.id,"type=",type);
    this._loadJSONfromNode(node, (error, json, jsonPath, jsonContentProvider) => {
      if (error) {
        return callback(error);
      }
      
      if (!json) {
        var ex=new Error("JSON is empty");
        ex.node=node;
        ex.type=type;
        ex.key=key;
        return callback(ex);
      }
  
      var tmdb = json['themoviedb.org'];
      if (!tmdb) {
        return callback("No moviedb datas");
      }
      
      var tvInfo = tmdb.tvInfo;

      var p;
      if (node.attributes.jsonType==="directory") {
        switch(type) {
        case "poster":
          p=tvInfo.poster_path;
          break;
        case "backdrop":
          p=tvInfo.backdrop_path;
          break;
        }
      } else {
        
      }
      
      if (!p) {
        return callback("Can not found type !");
      }

      p = jsonContentProvider.join(jsonPath, '..', "tmdb", p);
      
      debug("_getResourceContentURL", "Return resource path=",p);
      
      callback(null, p);
    });
  }
}

module.exports = tmdb;
