/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Path = require("path");
var fs = require("fs");
var Util = require('util');
var Mime = require('mime');
var send = require('send');

var debug = require('debug')('upnpserver:abstract_metas');

var ContentHandler = require('./contentHandler');

var REQUEST_REGEXP = /^([^_]+)_(.+)$/i;

var Abstract_Metas = function(configuration) {
  ContentHandler.call(this, configuration);
};

Util.inherits(Abstract_Metas, ContentHandler);

module.exports = Abstract_Metas;

Abstract_Metas.prototype.getTrailerPath = function(node, key) {
  throw new Error("Must be implemented !");
};

Abstract_Metas.prototype.getPosterPath = function(node, key) {
  throw new Error("Must be implemented !");
};

Abstract_Metas.prototype.refTrailer = function(node, afKey, callback) {

  var self = this;

  var trailerPath = this.getTrailerPath(node, afKey);

  fs.stat(trailerPath, function(error, stats) {
    if (debug.enabled) {
      debug("Trailer '" + trailerPath + "' => " + ((error) ? error : "FOUND"));
    }
    if (error) {
      return callback(error);
    }

    var mimeType = Mime.lookup(trailerPath);

    node.newRes({
      contentHandlerKey : self.key,
      mimeType : mimeType,
      key : "trailer_" + afKey,
      size : stats.size,
      additionalInfo : "type=trailer"
    });

    callback();
  });
};

Abstract_Metas.prototype.refPoster = function(node, afKey, callback) {

  var self = this;

  var posterPath = this.getPosterPath(node, afKey);

  fs.stat(posterPath, function(error, stats) {
    if (debug.enabled) {
      debug("Poster '" + posterPath + "' => " + ((error) ? error : "FOUND"));
    }

    if (error) {
      return callback(error);
    }

    var mimeType = Mime.lookup(posterPath);

    node.newRes({
      contentHandlerKey : self.key,
      mimeType : mimeType,
      size : stats.size,
      key : "poster_" + afKey,
      additionalInfo : "type=poster"
    });

    callback();
  });
};

Abstract_Metas.prototype.processRequest = function(node, request, response,
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

  fs.exists(resourcePath, function(exists) {
    if (!exists) {
      console.error("Not exist '" + resourcePath + "'");
      return callback("Invalid path '" + resourcePath + "'", true);
    }
    if (debug.enabled) {
      debug("Send '" + resourcePath + "'");
    }

    var stream = send(request, resourcePath);
    stream.pipe(response);

    stream.on('end', function() {
      callback(null, true);
    });
  });
};
