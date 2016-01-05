/*jslint node: true, esversion: 6 */
"use strict";

const Path = require("path");
const fs = require("fs");
const Mime = require('mime');

const debug = require('debug')('upnpserver:abstract_metas');
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
  refTrailer(metas, contentURL, afKey, callback) {

    var trailerPath = this.getTrailerPath(contentURL, afKey);
    if (!trailerPath) {
      return callback();
    }

    var contentProvider = this.service.getContentProvider(trailerPath);

    contentProvider.stat(trailerPath, (error, stats) => {
      debug("StatTrailer", trailerPath, "=>", stats, "error=", error);
      if (error) {
        logger.error("Can not stat",trailerPath);
        return callback(error);
      }

      metas.res=metas.res || [];      
      metas.res.push({
        contentHandlerKey : this.name,
        key : "trailer_" + afKey,
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
  refPoster(metas, contentURL, afKey, callback) {

    var posterPath = this.getPosterPath(contentURL, afKey);
    if (!posterPath) {
      return callback();
    }

    var contentProvider = this.service.getContentProvider(posterPath);

    contentProvider.stat(posterPath, (error, stats) => {
      debug("StatPoster", posterPath, "=>", stats, "error=",error);
      if (error) {
        logger.error("Can not stat",posterPath,error);
        return callback(error);
      }

      metas.res=metas.res || [];      
      metas.res.push({
        contentHandlerKey : this.name,
        key : "poster_" + afKey,
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

    var ret = REQUEST_REGEXP.exec(parameters.resKey);

    debug("Parse Key", parameters.resKey, "=>", ret);
    if (!ret) {
      return callback("Invalid key parameter (" + parameters.resKey + ")", true);
    }

    var res;
    if (node.attributes && node.attributes.res) {
      res=node.attributes.res.find((r) => r.contentHandlerKey===this.name && r.key===parameters.resKey);
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
      return callback("Invalid key '" + parameters.resKey + "'", true);
    }

    var ats={
        contentURL: resourcePath
    };
    if (res) {
      ats.mtime=res.mtime;
      ats.mime=res.mime;
      ats.size=res.size;
    }

    this.service.sendContentURL(ats, request, response, callback);
  }
}

module.exports = Abstract_Metas;
