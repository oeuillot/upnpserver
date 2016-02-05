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
  getTrailerPath(contentURL, key) {
    throw new Error("Must be implemented !");
  }

  /**
   * 
   */
  getPosterPath(contentURL, key) {
    throw new Error("Must be implemented !");
  }

  /**
   * 
   */
  refTrailer(metas, contentURL, movieKey, callback) {

    var trailerPath = this.getTrailerPath(contentURL, movieKey);
    if (!trailerPath) {
      return callback();
    }

    var contentProvider = this.service.getContentProvider(trailerPath);

    contentProvider.stat(trailerPath, (error, stats) => {
      debug("StatTrailer", trailerPath, "=>", stats, "error=", error);
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
        mimeType : stats.mime,
        size : stats.size,
        additionalInfo : "type=trailer",
        mtime: stats.mtime.getTime()
      });

      callback();
    });
  }

  /**
   * 
   */
  refPoster(metas, contentURL, movieKey, callback) {

    var posterPath = this.getPosterPath(contentURL, movieKey);
    if (!posterPath) {
      return callback();
    }

    var contentProvider = this.service.getContentProvider(posterPath);

    contentProvider.stat(posterPath, (error, stats) => {
      debug("StatPoster", posterPath, "=>", stats, "error=",error);
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
        mimeType : stats.mime,
        size : stats.size,
        additionalInfo : "type=poster",
        mtime: stats.mtime.getTime()
      });

      callback();
    });
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var resKey=parameters[0];
    var ret = REQUEST_REGEXP.exec(resKey);

    debug("Parse Key", resKey, "=>", ret);
    if (!ret) {
      var error=new Error("Invalid key parameter (" + parameters + ")");
      error.node=node;
      error.request=request;
      return callback(error, true);
    }

    var res;
    if (node.attributes && node.attributes.res) {
      res=node.attributes.res.find((r) => r.contentHandlerKey===this.name && r.key===resKey);
    }

    var key = ret[2];

    var resourcePath;

    switch(ret[1]) {
    case "poster":
      resourcePath = this.getPosterPath(node, key);
      break;
      
    case "trailer":
      resourcePath = this.getTrailerPath(node, key);
      break;
    }

    if (!resourcePath) {
      return callback("Invalid key '" + resKey + "'", true);
    }

    var ats={
        contentURL: resourcePath
    };
    if (res) {
      ats.mtime=res.mtime;
      ats.mimeType=res.mimeType;
      ats.size=res.size;
    }

    this.service.sendContentURL(ats, request, response, callback);
  }
}

module.exports = Abstract_Metas;
