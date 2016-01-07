/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const fs = require('fs');
const Path = require('path');
const Async = require('async');
const debug = require('debug')('upnpserver:contentProvider:file');
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
        files[i] = basePath + '/' + files[i];
      }

      if (debug.enabled) {
        debug("readdir('" + basePath + "' returns", files);
      }

      return callback(null, files);
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

      if (stats.isDirectory()) {
        stats.mime = DIRECTORY_MIME_TYPE;

        return callback(null, stats);
      }

      var mime = Mime.lookup(path, "");
      stats.mime = mime;

      if (!COMPUTE_HASH) {
        return callback(null, stats);
      }

      this.computeHash(path, stats, (error, hash) => {

        stats.sha256 = hash;

        callback(null, stats);
      });
    });
  }

  /**
   * 
   */
  createReadStream(session, path, options, callback) {
    assert(path, "Path parameter is null");

    var osPath = path;
    if (CHANGE_PATH_SEPARATOR) {
      osPath = osPath.replace(/\//g, Path.sep);
    }

    options = options || {}; // Fix for Nodejs v4

    var openStream = () => {
      if (debug.enabled) {
        debug("createReadStream osPath=", osPath, "options=", options);
      }

      try {
        var stream = fs.createReadStream(osPath, options);

        if (options && options.fd) {
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
        debug("createReadStream path=", osPath, "session.fd=" + session.fd);
      }

      if (!session.fd) {
        fs.open(osPath, 'r', (error, fd) => {
          if (error) {
            return callback(error);
          }
          session.fd = fd;
          options.fd = fd;

          if (debug.enabled) {
            debug("createReadStream open '" + osPath + "' => session.fd=" +
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
