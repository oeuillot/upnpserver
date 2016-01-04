/*jslint node: true, esversion: 6 */
"use strict";

const spawn = require('child_process').spawn;
const debug = require('debug')('upnpserver:ffprobe');

const ContentHandler = require('./contentHandler');

class Srt extends ContentHandler {

  get name() {
    return "srt";
  }

  /**
   * 
   */
  prepareMetas(contentURL, stats, callback) {

    var srtPath = contentURL.replace(/\.[^.]*$/, '.srt');
    this.service.getContentProvider(srtPath).stat(srtPath,
        (error, stats) => {
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
}

module.exports = Srt;
