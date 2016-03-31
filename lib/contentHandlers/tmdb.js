/*jslint node: true, esversion: 6 */
"use strict";

const Path = require('path');
const Async = require('async');

const debug = require('debug')('upnpserver:contentHandlers:tmdb');
const logger = require('../logger');

const MetasImages = require('./metas.images');

const movieKey = /__tmv(\d+)[^A-Za-z]/i;
const tvKey = /__ttv(\d+)[^A-Za-z]/i;

class tmdb extends MetasImages {
  constructor(configuration) {
    super(configuration);
  }

  get name() {
    return "tmdb";
  }
  
  _getKeyFromFileName(basename) {
    var reg=movieKey.exec(basename);
    debug("_getKeyFromFileName", "basename=",basename," movieKey=>",reg);
    if (reg) {
      return reg[1];
    }

    reg=tvKey.exec(basename);
    debug("_getKeyFromFileName", "basename=",basename," tvKey=>",reg);
    if (reg) {
      return reg[1];
    }

    return null;
  }
  
  _getKeyFromDirectoryName(basename) {
    var reg=tvKey.exec(basename);
    debug("_getKeyFromDirectoryName", "basename=",basename," tvKey=>",reg);
    if (reg) {
      return reg[1];
    }

    return null;
  }

  _computeJSONPathInBase(key, fileInfos, callback) {
    if (!this._baseURL) {
      return callback();
    }
    
    var jsonURL;
    if (fileInfos.type==="directory" || fileInfos.type==="tvInfo") {    
      jsonURL = this._baseURL.join("tv"+ key, "tvInfo.json");
      
    } else {
      jsonURL = this._baseURL.join("mv"+ key, "movieInfo.json");
    }
    
    debug("_computeJSONPathInBase", "key=", key, "fileInfos=", fileInfos, "=>", jsonURL);
        
    callback(null, jsonURL, fileInfos);
  }


  _processTvShow(contentInfos, metasContext, jsonContext, fileInfos, callback) {
    var season=fileInfos.season;
    var episode = fileInfos.episode;
    
    debug("_processTvShow", "Process file",contentInfos.contentURL,"jsonContext=",jsonContext,"season",season,"episode=",episode);

    var json=jsonContext.content;
    
    var tmdb = json['themoviedb.org'];
    if (!tmdb || tmdb.type!=="tv" || !tmdb.tvInfo) {
      return callback();
    }

    var tvInfo = tmdb.tvInfo;

    var seasonJson = (tvInfo.seasons || []).find((s) => s.season_number===season);
    debug("_processTvShow", "SeasonJson=", seasonJson);
    if (!seasonJson) {
      return callback();
    }

    var episodeJson = (seasonJson.episodes || []).find((e) => e.episode_number===episode);
    debug("_processTvShow", "EpisodeJson=", episodeJson);
    if (!episodeJson) {
      return callback();
    }

    var metas = {};
    metas.season = episodeJson.season_number;
    metas.episode = episodeJson.episode_number;
    metas.episodeCount = seasonJson.episode_count;    

    if (episodeJson.name) {
      metas.title = formatSeasonEpisode(episodeJson.name, season, episode);
      metas.titleAlsoKnownAs = episodeJson.name;
    } else {
      metas.title = formatSeasonEpisode(null, season, episode);      
    }
    if (episodeJson.overview) {
      metas.longDescription = episodeJson.overview;
    }
    if (episodeJson.air_date) {
      metas.airDate = episodeJson.air_date;
    }

    var statistics = episodeJson.vote_count;
    if (statistics) {
      metas.ratings = metas.ratings || [];
      metas.ratings.push({
        type : "af_user",
        rating : episodeJson.vote_average/2  // 5 stars
      });
    }

    var tasks=[];

    if (episodeJson.poster_path) {
      tasks.push((callback) => {
        var posterURL = jsonContext.resourcesURL.join(episodeJson.poster_path);
        debug("_processTvShow", "try posterURL=",posterURL);

        this._addImage(metas, posterURL, "poster", "poster", true, callback);
      });
    }

    if (episodeJson.still_path) {
      tasks.push((callback) => {
        var stillURL = jsonContext.resourcesURL.join(episodeJson.still_path);
        debug("_processTvShow", "try stillURL=", stillURL);

        this._addImage(metas, stillURL, "still", "still", true, callback);
      });
    }

    if (seasonJson.poster_path) {
      tasks.push((callback) => {
        var posterURL = jsonContext.resourcesURL.join(seasonJson.poster_path);
        debug("_processTvShow", "try season posterURL=", posterURL);

        this._addImage(metas, posterURL, "season-poster", "season-poster", true, callback);
      });
    }

    if (tvInfo.poster_path) {
      tasks.push((callback) => {
        var posterURL = jsonContext.resourcesURL.join(tvInfo.poster_path);
        debug("_processTvShow", "try serie posterURL=",posterURL);

        this._addImage(metas, posterURL, "tv-poster", "tv-poster", true, callback);
      });
    }

    Async.series(tasks, (error) => {
      if (error) {
        return callback(error);
      }

      callback(null, metas);
    });
  }
  
  _processFile(contentInfos, metasContext, jsonContext, fileInfos, callback) {
    debug("_processFile", "Process file",contentInfos.contentURL,"json=",jsonContext,"infos=",fileInfos);
    if (fileInfos.type==="tvShow") {
      this._processTvShow(contentInfos, metasContext, jsonContext, fileInfos, callback);
      return;
    }
    
    callback();
  }
  
  _processFolder(contentInfos, metasContext, jsonContext, directoryInfo, callback) {
    debug("_processFolder", "Process folder",contentInfos.contentURL,"json=",jsonContext, "directoryInfo=",directoryInfo);
    var json=jsonContext.content;
    var tmdb = json['themoviedb.org'];
    if (!tmdb || tmdb.type!=="tv" || !tmdb.tvInfo) {
      debug("_processFolder", "No tmdb", tmdb);
      return callback();
    }

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
        var posterURL= jsonContext.resourcesURL.join(tvInfo.poster_path);
        debug("_processFolder", "try serie posterURL=",posterURL);

        this._addImage(metas, posterURL, "poster", "poster", true, callback);
      });
    }

    if (tvInfo.backdrop_path) {
      tasks.push((callback) => {
        var backdropURL= jsonContext.resourcesURL.join(tvInfo.backdrop_path);
        debug("_processFolder", "try serie backdropURL=",backdropURL);

        this._addImage(metas, backdropURL, "backdrop", "backdrop", false, callback);
      });
    }

    Async.series(tasks, (error) => {
      if (error) {
        return callback(error);
      }

      callback(null, metas);
    });
  }  

  _getResourceContentURL(node, type, key, parameters, res, callback) {
    var attributes=node.attributes;

    debug("_getResourceContentURL", "Get contentURL of key=",key,"node=#",node.id,"type=",type);
    this._loadJSONfromNode(node, (error, jsonContext) => {
      if (error) {
        return callback(error);
      }

      if (!jsonContext) {
        var ex=new Error("JSON is empty");
        ex.node=node;
        ex.type=type;
        ex.key=key;
        return callback(ex);
      }
      
      var json = jsonContext.content;

      var tmdb = json['themoviedb.org'];
      if (!tmdb) {
        return callback("No moviedb datas");
      }

      var tvInfo = tmdb.tvInfo;

      debug("_getResourceContentURL", "resourceType=",attributes.resourceType,"season=",attributes.season,"episode=",attributes.episode);

      var p;
      if (attributes.resourceType==="directory") {
        switch(type) {
        case "poster":
          p=tvInfo.poster_path;
          break;
        case "backdrop":
          p=tvInfo.backdrop_path;
          break;
        }
      } else if (attributes.resourceType==="tvShow") {
        if (type==="tv-poster") {
          p=tvInfo.poster_path;

        } else if (attributes.season!==undefined) {
          var jseason=(tvInfo.seasons || []).find((s) => s.season_number===attributes.season);

          if (jseason) {
            if (type==="season-poster") {
              p=jseason && jseason.poster_path;

            } else if (attributes.episode!==undefined) {
              var jepisode = (jseason.episodes || []).find((e) => e.episode_number===attributes.episode);

              if (jepisode) {
                switch(type) {
                case "poster":
                  p=jepisode.poster_path;
                  
                  if (!p) {
                    p=jseason && jseason.poster_path;
                    
                    if (!p) {
                      p=tvInfo.poster_path;
                    }
                  }
                  break;
                case "still":
                  p=jepisode.still_path;
                  break;
                }
              }
            }
          }
          
        }
      }

      if (!p) {
        debug("_getResourceContentURL", "Can not found tmdb path attributes=",attributes);

        return callback("Can not found type !");
      }
      
      var url= jsonContext.resourcesURL.join(p);

      debug("_getResourceContentURL", "Return resource path=", p, "parameters=", parameters);

      if (parameters[1]) {
        var reg=/w(\d+)/.exec(parameters[1]);
        if (reg) {
          debug("_getResourceContentURL", "param _wX",reg);
          
          var r2=/([^\/]+)\.([^.]+)$/.exec(url.basename);
          
          debug("_getResourceContentURL", "Split path=",r2);
          if (r2) {
            var url2=url.changeBasename(r2[2]+'_'+parameters[1]+"."+r2[3]);
            
            url2.stat((error, stats) => {              
              debug("_getResourceContentURL","url2=",url2,"error=",error,"stats=",stats);
              
              if (error || (stats && !stats.size)) {
                logger.error(error);
                
                return callback(null, url);
              }
              
              callback(null, url2);
            });
            return;
          }
        }
      }

      callback(null, url);
    });
  }
}

function formatSeasonEpisode(name, season, episode) {
  var s="";
  if (typeof(season)==="number") {
    s+="S"+((season<10)?"0":"")+season;
  }
  if (typeof(episode)==="number") {
    s+="E"+((episode<10)?"0":"")+episode;
  }
  
  if (name) {
    if (s) {
      s+=" ";
    }
    
    s+=name;
  }
  return s;
}

module.exports = tmdb;
