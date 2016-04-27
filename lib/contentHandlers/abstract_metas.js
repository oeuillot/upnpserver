/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:contentHandlers:AbstractMetas');
const logger = require('../logger');

const ContentHandler = require('./contentHandler');

const REQUEST_REGEXP = /^([^_]+)_(.+)$/i;

class Abstract_Metas extends ContentHandler {

  /**
   * 
   */
  getTrailerURL(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getPosterURL(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getStillURL(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  getBackdropURL(contentURL, key, callback) {
    callback(new Error("Must be implemented !"));
  }

  /**
   * 
   */
  _getResourceContentURL(node, type, key, parameters, res, callback) {

    switch (type) {
      case "poster":
        this.getPosterURL(node, key, callback);
        return;

      case "trailer":
        this.getTrailerURL(node, key, callback);
        return;

      case "still":
        this.getStillURL(node, key, callback);
        return;

      case "backdrop":
        this.getBackdropURL(node, key, callback);
        return;
    }

    callback();
  }

  /**
   * 
   */
  refTrailer(metas, contentURL, movieKey, callback) {

    this.getTrailerURL(contentURL, movieKey, (error, trailerURL) => {
      if (error) {
        debug("refTrailer", "ContentURL=", contentURL, "error=", error, error.stack);
        return callback(error);
      }

      trailerURL.stat((error, stats) => {
        debug("refTrailer", "Stat trailer path=", trailerURL, "=>", stats, "error=", error);
        if (error) {
          if (error.code === 'ENOENT') {
            return callback();
          }
          error.trailerURL = trailerURL;
          return callback(error);
        }

        metas.res = metas.res || [{}];
        metas.res.push({
          contentHandlerKey: this.name,
          key: "trailer_" + movieKey,
          mimeType: stats.mimeType,
          size: stats.size,
          additionalInfo: "type=trailer",
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

    this.getPosterURL(contentURL, movieKey, (error, posterURL) => {
      if (error) {
        var ex = new Error("Can not get posterURL");
        ex.movieKey = movieKey;
        ex.contentURL = contentURL;
        ex.error = error;
        return callback(ex);
      }

      posterURL.stat((error, stats) => {
        debug("refPoster", "Stat poster url=", posterURL, "=>", stats, "error=", error);
        if (error) {
          if (error.code === 'ENOENT') {
            return callback();
          }

          //logger.error("Can not stat url=",posterURL, error);
          error.posterURL = posterURL;
          error.movieKey = movieKey;
          return callback(error);
        }

        metas.res = metas.res || [{}];
        metas.res.push({
          contentHandlerKey: this.name,
          key: "poster_" + movieKey,
          mimeType: stats.mimeType,
          size: stats.size,
          additionalInfo: "type=poster",
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

    var type = parameters[0];
    var resKey;
    var ret = REQUEST_REGEXP.exec(type);
    if (ret) {
      resKey = ret[2];
      type = ret[1];
    }

    debug("processRequest", "Parse Key", parameters, "=> type=", type, "resKey=", resKey);

    var res;
    if (node.attributes && node.attributes.res) {
      if (resKey) {
        res = node.attributes.res.find((r) => r.contentHandlerKey === this.name && r.key === resKey);
      } else {
        res = node.attributes.res.find((r) => r.contentHandlerKey === this.name && r.key === type);
      }
    }

    this._getResourceContentURL(node, type, resKey, parameters, res, (error, resourceContentURL) => {
      if (error) {
        return callback(error);
      }

      if (!resourceContentURL) {
        return callback("Invalid key '" + resKey + "'", true);
      }

      var ats = {
        contentURL: resourceContentURL
      };

      if (res) {
        ats.mtime = res.mtime;
        ats.mimeType = res.mimeType;
        ats.size = res.size;
      }

      this.service.sendContentURL(ats, request, response, callback);
    });
  }
}

module.exports = Abstract_Metas;
