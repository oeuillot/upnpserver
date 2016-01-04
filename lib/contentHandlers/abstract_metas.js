/*jslint node: true, esversion: 6 */
"use strict";

const Path = require("path");
const fs = require("fs");
const Mime = require('mime');
const send = require('send');

const debug = require('debug')('upnpserver:abstract_metas');

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

    fs.stat(trailerPath, (error, stats) => {
      if (debug.enabled) {
        debug("Trailer '" + trailerPath + "' => " + ((error) ? error : "FOUND"));
      }
      if (error) {
        return callback(error);
      }

      var mimeType = Mime.lookup(trailerPath);

      metas.res=metas.res || [];      
      metas.res.push({
        contentHandlerKey : this.name,
        mimeType : mimeType,
        key : "trailer_" + afKey,
        size : stats.size,
        additionalInfo : "type=trailer"
      });

      callback();
    });
  }

  /**
   * 
   */
  refPoster(metas, contentURL, afKey, callback) {

    var posterPath = this.getPosterPath(contentURL, afKey);

    fs.stat(posterPath, (error, stats) => {
      if (debug.enabled) {
        debug("Poster '" + posterPath + "' => " + ((error) ? error : "FOUND"));
      }

      if (error) {
        return callback(error);
      }

      var mimeType = Mime.lookup(posterPath);

      metas.res=metas.res || [];      
      metas.res.push({
       contentHandlerKey : this.name,
        mimeType : mimeType,
        size : stats.size,
        key : "poster_" + afKey,
        additionalInfo : "type=poster"
      });

      callback();
    });
  }

  /**
   * 
   */
  processRequest(node, request, response,
      path, parameters, callback) {

    var ret = REQUEST_REGEXP.exec(parameters.resKey);

    if (debug.enabled) {
      debug("Parse Key '" + parameters.resKey + "' => " + ret);
    }
    if (!ret) {
      return callback("Invalid key parameter (" + parameters.resKey + ")", true);
    }

    var key = ret[2];

    var resourcePath;

    if (ret[1] === "poster") {
      resourcePath = this.getPosterPath(node, key);

    } else if (ret[1] === "trailer") {
      resourcePath = this.getTrailerPath(node, key);
    }

    if (!resourcePath) {
      return callback("Invalid key '" + parameters.resKey + "'", true);
    }

    fs.exists(resourcePath, (exists) => {
      if (!exists) {
        console.error("Not exist '" + resourcePath + "'");
        return callback("Invalid path '" + resourcePath + "'", true);
      }
      if (debug.enabled) {
        debug("Send '" + resourcePath + "'");
      }

      var stream = send(request, resourcePath);
      stream.pipe(response);

      stream.on('end', () => callback(null, true));
    });
  }
}

module.exports = Abstract_Metas;
