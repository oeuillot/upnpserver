/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:contentHandler.Srt');

const ContentHandler = require('./contentHandler');

const logger=require('../logger');

class Srt extends ContentHandler {

  get name() {
    return "srt";
  }

  /**
   * 
   */
  prepareMetas(contentURL, stats, callback) {

    var srtPath = contentURL.replace(/\.[^.]*$/, '.srt');
    this.service.getContentProvider(srtPath).stat(srtPath, (error, stats) => {
      if (error && error.code !== "ENOENT") {
        return callback(error);
      }

      if (stats && stats.isFile() && stats.size > 0) {
        var metas= {
            hasSubtitle: "SRT"
        };

        debug("SRT detected => " + srtPath);

        return callback(null, metas);
      }

      return callback();
    });
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var srtIndex = parseInt(parameters[0], 10);
    if (srtIndex < 0) {
      return callback("Invalid srt parameter", true);
    }

    var srtPath = node.contentURL.replace(/\.[^.]*$/, '.srt');

    this.service.sendContentURL({
      contentURL: srtPath

    }, request, response, callback);
  }
}

module.exports = Srt;
