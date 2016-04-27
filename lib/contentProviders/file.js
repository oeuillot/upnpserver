/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const fs = require('fs');
const Path = require('path');
const Async = require('async');
const debug = require('debug')('upnpserver:contentProviders:File');
const crypto = require('crypto');

const logger = require('../logger');

const ContentProvider = require('./contentProvider');

const DIRECTORY_MIME_TYPE = "inode/directory";

const CHANGE_PATH_SEPARATOR = (Path.sep !== '/');

const COMPUTE_HASH = false;

class FileContentProvider extends ContentProvider {

  /**
   * 
   */
  get isLocalFilesystem() {
    return true;
  }

  /**
   * 
   */
  readdir(basePath, callback) {

    assert(typeof (basePath) === "string", "Base path is not a string (" +
        basePath + ")");

    var osPath = basePath;
    if (CHANGE_PATH_SEPARATOR) {
      osPath = osPath.replace(/\//g, Path.sep);
    }

    fs.readdir(osPath, (error, files) => {
      if (error) {
        return callback(error);
      }

      for (var i = 0; i < files.length; i++) {
        files[i] = this.newURL(basePath + '/' + files[i]);
      }

      debug("readdir", "returns basePath=", basePath, "=>", files);

      callback(null, files);
    });
  }

  /**
   * 
   */
  stat(path, callback) {
    var osPath = path;
    if (CHANGE_PATH_SEPARATOR) {
      osPath = osPath.replace(/\//g, Path.sep);
    }

    fs.stat(osPath, (error, stats) => {
      if (error) {
        return callback(error);
      }

      var reg=/\/([^\/]+)$/.exec(path);
      if (reg) {
        stats.name=reg[1];
      }

      if (stats.isDirectory()) {
        stats.mimeType = DIRECTORY_MIME_TYPE;

        return callback(null, stats);
      }

      var mimeType = Mime.lookup(path, "");
      stats.mimeType = mimeType;
      
      if (!COMPUTE_HASH) {
        return callback(null, stats);
      }

      this.computeHash(path, stats, (error, hash) => {

        stats.sha256 = hash;

        callback(null, stats);
      });
    });
  }

  _mkdir(osPath, callback) {
    debug("_mkdir", "path=",osPath);
    
    fs.access(osPath, fs.R_OK | fs.W_OK, (error) => {  
      if (error) {
        console.log("_mkdir", "parent=",osPath,"access problem=",error);
        
        if (error.code==='ENOENT') {
          var parent=Path.dirname(osPath);

          this._mkdir(parent, (error) => {
            if (error) {
              return callback(error);
            }
            
            fs.mkdir(osPath, callback);
          });
          return;
        }
        
        return callback(error);
      }
      
      callback();
    });
  }
  
  /**
   * 
   */
  createWriteStream(url, options, callback) {
    debug("createWriteStream", "Url=",url,"options=",options);

    var osPath = url;
    if (CHANGE_PATH_SEPARATOR) {
      osPath = osPath.replace(/\//g, Path.sep);
    }

    var parent=Path.dirname(osPath);
  
    this._mkdir(parent, (error) => {  
      if (error) {
        console.log("createWriteStream", "parent=",parent,"access problem=",error);
        return callback(error);
      }
      
      var stream = fs.createWriteStream(url, options);
      
      callback(null, stream);
   });
  }

  /**
   * 
   */
  createReadStream(session, path, options, callback) {
    debug("createReadStream", "path=",path,"options=",options);
    assert(path, "Path parameter is null");

    var osPath = path;
    if (CHANGE_PATH_SEPARATOR) {
      osPath = osPath.replace(/\//g, Path.sep);
    }

    options = options || {}; // Fix for Nodejs v4

    var openStream = () => {
      if (debug.enabled) {
        debug("createReadStream", "osPath=", osPath, "options=", options);
      }

      try {
        var stream = fs.createReadStream(osPath, options);

        if (options && options.fd) {
          // Disable default destroy callback
          stream.destroy = () => {
          };
        }

        return callback(null, stream);

      } catch (x) {
        logger.error("Can not access to " + path, x);

        return callback(x);
      }
    };

    if (session) {
      options = options || {};
      options.flags = 'r';
      options.autoClose = false;

      if (debug.enabled) {
        debug("createReadStream", "Has session: path=", osPath, "session.fd=" + session.fd);
      }

      if (!session.fd) {
        fs.open(osPath, 'r', (error, fd) => {
          if (error) {
            return callback(error);
          }
          session.fd = fd;
          options.fd = fd;

          if (debug.enabled) {
            debug("createReadStream", "Has session open '" + osPath + "' => session.fd=" +
                session.fd);
          }

          openStream();
        });

        return;
      }

      options.fd = session.fd;
    }

    openStream();
  }

  /**
   * 
   */
  end(session, callback) {
    if (session && session.fd) {

      if (debug.enabled) {
        debug("Close fd " + session.fd);
      }

      fs.close(session.fd, (error) => {
        delete session.fd;

        callback(error);
      });
      return;
    }
    callback();
  }
}

module.exports = FileContentProvider;
