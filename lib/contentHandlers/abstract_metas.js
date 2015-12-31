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

  getTrailerPath(node, key) {
    throw new Error("Must be implemented !");
  }

  getPosterPath(node, key) {
    throw new Error("Must be implemented !");
  }

  refTrailer(node, afKey, callback) {

    var trailerPath = this.getTrailerPath(node, afKey);

    fs.stat(trailerPath, (error, stats) => {
      if (debug.enabled) {
        debug("Trailer '" + trailerPath + "' => " + ((error) ? error : "FOUND"));
      }
      if (error) {
        return callback(error);
      }

      var mimeType = Mime.lookup(trailerPath);

      node.newRes({
        contentHandlerKey : this.key,
        mimeType : mimeType,
        key : "trailer_" + afKey,
        size : stats.size,
        additionalInfo : "type=trailer"
      });

      callback();
    });
  }

  refPoster(node, afKey, callback) {

    var posterPath = this.getPosterPath(node, afKey);

    fs.stat(posterPath, (error, stats) => {
      if (debug.enabled) {
        debug("Poster '" + posterPath + "' => " + ((error) ? error : "FOUND"));
      }

      if (error) {
        return callback(error);
      }

      var mimeType = Mime.lookup(posterPath);

      node.newRes({
        contentHandlerKey : this.key,
        mimeType : mimeType,
        size : stats.size,
        key : "poster_" + afKey,
        additionalInfo : "type=poster"
      });

      callback();
    });
  }

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
