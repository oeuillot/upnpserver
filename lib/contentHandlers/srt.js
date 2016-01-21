/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:contentHandlers.Srt');
const logger=require('../logger');

const ContentHandler = require('./contentHandler');

class Srt extends ContentHandler {

  get name() {
    return "srt";
  }

  /**
   * 
   */
  prepareMetas(contentURL, context, callback) {

    var srtPath = contentURL.replace(/\.[^.]*$/, '.srt');
    this.service.getContentProvider(srtPath).stat(srtPath, (error, stats) => {
      if (error) {
        if (error.code === "ENOENT") {
          return callback();
        }
        
        return callback(error);
      }

      if (stats.isFile() && stats.size > 0) {
        debug("SRT detected => " + srtPath);

        var res=[{}];
        var metas= {
            res: res
        };

        res.push({
          contentHandlerKey : this.name,
          key : "1",
          type: "srt",
          mimeType : "text/srt",
          size : stats.size,
          mtime: stats.mtime.getTime()         
        });

        return callback(null, metas);
      }

      return callback();
    });
  }

  /**
   * 
   */
  processRequest(node, request, response, path, parameters, callback) {

    var srtPath = node.contentURL.replace(/\.[^.]*$/, '.srt');

    this.service.sendContentURL({
      contentURL: srtPath

    }, request, response, callback);
  }
}

module.exports = Srt;
