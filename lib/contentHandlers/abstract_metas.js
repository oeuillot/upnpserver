/*jslint node: true, esversion: 6 */
"use strict";

const Path = require("path");

const debug = require('debug')('upnpserver:contentHandlers:AbstractMetas');
const logger = require('../logger');

const ContentHandler = require('./contentHandler');

const REQUEST_REGEXP = /^([^_]+)_(.+)$/i;

class Abstract_Metas extends ContentHandler {

  /**
   * 
   */
  getTrailerPath(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getPosterPath(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getStillPath(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getBackdropPath(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  _getResourceContentURL(node, type, key, res, callback) {

    switch(type) {
    case "poster":
      return this.getPosterPath(node, key, callback);

    case "trailer":
      return this.getTrailerPath(node, key, callback);

    case "still":
      return this.getStillPath(node, key, callback);

    case "backdrop":
      return this.getBackdropPath(node, key, callback);
    }    

    callback();
  }

  /**
   * 
   */
  refTrailer(metas, contentURL, movieKey, callback) {

    this.getTrailerPath(contentURL, movieKey, (error, trailerPath) => {
      if (error) {
        return callback(error);
      }

      var contentProvider = this.service.getContentProvider(trailerPath);

      contentProvider.stat(trailerPath, (error, stats) => {
        debug("refTrailer", "Stat trailer path=", trailerPath, "=>", stats, "error=", error);
        if (error) {
          if (error.code==='ENOENT') {
            return callback();
          }
          logger.error("Can not stat",trailerPath);
          return callback(error);
        }

        metas.res=metas.res || [{}];      
        metas.res.push({
          contentHandlerKey : this.name,
          key : "trailer_" + movieKey,
          mimeType : stats.mimeType,
          size : stats.size,
          additionalInfo : "type=trailer",
          mtime: stats.mtime.getTime()
        });

        callback();
      });
    });
  }

  /**
   * 
   */
  refPoster(metas, contentURL, movieKey, callback) {

    this.getPosterPath(contentURL, movieKey, (error, posterPath) => {
      if (error) {
        return callback(error);
      }

      var contentProvider = this.service.getContentProvider(posterPath);

      contentProvider.stat(posterPath, (error, stats) => {
        debug("refPoster", "Stat poster path=", posterPath, "=>", stats, "error=",error);
        if (error) {
          if (error.code==='ENOENT') {
            return callback();
          }

          logger.error("Can not stat",posterPath,error);
          return callback(error);
        }

        metas.res=metas.res || [{}];
        metas.res.push({
          contentHandlerKey : this.name,
          key : "poster_" + movieKey,
          mimeType : stats.mimeType,
          size : stats.size,
          additionalInfo : "type=poster",
          mtime: stats.mtime.getTime()
        });

        callback();
      });
    });
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var type=parameters[0];
    var resKey;
    var ret = REQUEST_REGEXP.exec(type);
    if (ret) {
      resKey=ret[2];
      type=ret[1];
    }

    debug("processRequest", "Parse Key", parameters, "=> type=", type, "resKey=",resKey);

    var res;
    if (node.attributes && node.attributes.res) {
      if (resKey) {
        res=node.attributes.res.find((r) => r.contentHandlerKey===this.name && r.key===resKey);
      } else {
        res=node.attributes.res.find((r) => r.contentHandlerKey===this.name && r.key===type);        
      }
    }

    this._getResourceContentURL(node, type, resKey, res, (error, resourceContentURL) => {
      if (error) {
        return callback(error);
      }

      if (!resourceContentURL) {
        return callback("Invalid key '" + resKey + "'", true);
      }

      var ats={
          contentURL: resourceContentURL
      };

      if (res) {
        ats.mtime=res.mtime;
        ats.mimeType=res.mimeType;
        ats.size=res.size;
      }

      this.service.sendContentURL(ats, request, response, callback);
    });
  }
}

module.exports = Abstract_Metas;
