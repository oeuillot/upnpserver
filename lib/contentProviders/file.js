/*jslint node: true, nomen: true */
"use strict";

var assert = require('assert');
var Util = require('util');
var Mime = require('mime');
var fs = require('fs');
var Path = require('path');
var Async = require('async');

var debug = require('debug')('upnpserver:contentProvider:file');
var logger = require('../logger');

var ContentProvider = require('./contentProvider');
var watch = require("../util/watch");

var DIRECTORY_MIME_TYPE = "application/x-directory";

var CHANGE_PATH_SEPARATOR = (Path.sep !== '/');

function FileContentProvider(service, configuration) {
  ContentProvider.call(this, service, configuration);
  this.changeTimeout = null;
}

Util.inherits(FileContentProvider, ContentProvider);

module.exports = FileContentProvider;

FileContentProvider.prototype.readdir = function(basePath, callback) {

  var osPath = basePath;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  fs.readdir(osPath, function(error, files) {
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
};

FileContentProvider.prototype.stat = function(path, callback) {
  var osPath = path;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  fs.stat(osPath, function(error, stats) {
    if (error) {
      return callback(error);
    }

    if (stats.isDirectory()) {
      stats.mime = DIRECTORY_MIME_TYPE;

      return callback(null, stats);
    }

    var mime = Mime.lookup(path, "");
    stats.mime = mime;

    return callback(null, stats);
  });
};

FileContentProvider.prototype.createReadStream = function(session, path,
    options, callback) {
  assert(path, "Path parameter is null");

  var osPath = path;
  if (CHANGE_PATH_SEPARATOR) {
    osPath = osPath.replace(/\//g, Path.sep);
  }

  options = options || {}; // Fix for Nodejs v4

  function openStream() {
    if (debug.enabled) {
      debug("createReadStream osPath=", osPath, "options=", options);
    }

    try {
      var stream = fs.createReadStream(osPath, options);

      if (options && options.fd) {
        stream.destroy = function() {
        };
      }

      return callback(null, stream);

    } catch (x) {
      logger.error("Can not access to " + path, x);

      return callback(x);
    }
  }

  if (session) {
    options = options || {};
    options.flags = 'r';
    options.autoClose = false;

    if (debug.enabled) {
      debug("createReadStream path=", osPath, "session.fd=" + session.fd);
    }

    if (!session.fd) {
      fs.open(osPath, 'r', function(error, fd) {
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
};

FileContentProvider.prototype.end = function(session, callback) {
  if (session && session.fd) {

    if (debug.enabled) {
      debug("Close fd " + session.fd);
    }

    fs.close(session.fd, function(error) {
      delete session.fd;

      callback(error);
    });
    return;
  }
  callback();
};
/**
 * Handle filesystem changes events
 */
// NOTE: may be repository dependant ?
FileContentProvider.prototype.processChanges = function(repository, add, remove) {
  var self = this;
  var root = repository.root;

  var skip_keep = !repository.keepFile;
  add.forEach(function(file){
      self.stat(file, function(err, infos){
        debug(infos);
        if (skip_keep || repository.keepFile(infos)){
          repository.processFile(root, file, infos, function(err){
            if (err) console.log(err);
            debug("add "+file+" success");
          });
        }
      });
  });

  if (remove.length){
      // remove node and nodeRefs
      root.filterChildNodes(root, [], function(node){
        // debug('filter ', node.attributes.contentURL);
        return node.attributes &&
               node.attributes.contentURL &&
               remove.indexOf(node.attributes.contentURL) > -1
      }, function(err, childs){

          debug('remove ', childs.length);

          if (err) return console.log(err);

          // 1 remove noderefs for nodes
          var idsToRemove = childs.map(function(node){return node.id});
          root.filterChildNodes(root, [], function(ref){
            return ref.refID &&
                   idsToRemove.indexOf(ref.refID) > -1
          }, function(err, refs){
            refs.forEach(function(ref){
              ref.getParent(function(err, parent){
                  if (err) return console.log(err);
                  parent.removeChild(ref, function(err){if (err) console.log(err);});
              });
            });
          });

          // 2 remove nodes
          childs.forEach(function(child){
            debug('remove ', child.attributes.contentURL);
              child.getParent(function(err, parent){
                  if (err) return console.log(err);
                  parent.removeChild(child, function(err){if (err) console.log(err);});
              });
          });

      });

    }

}
/**
 * Monitor filesystem changes
 *
 * Handle three possible events
 * - change (wont do anything)
 * - add
 * - remove
 *
 * NOTE: on OSX add & remove event
 * also change .DS_Store
 *
 */
FileContentProvider.prototype.monitor = function(Repository) {

  var self = this;
  // if (!this.configuration.monitor) return;
  var repository = Repository;

  var changes = {add:[], remove:[]};

  debug('monitor ',repository.directoryPath);


  watch(repository.directoryPath, {recursive: true}, function(file, event) {

      debug(event, ' ', file);

      switch(event){
        case "add":{
          changes.add.push(file);
          break;
        }
        case "remove":{
          changes.remove.push(file);
          break;
        }
        default: return;
      }
      // group changes and update after 2 seconds
      clearTimeout(self.changeTimeout);
      self.changeTimeout = setTimeout(function(){
        var add    = changes.add.splice(0, changes.add.length);
        var remove = changes.remove.splice(0, changes.remove.length);
        self.processChanges(repository, add, remove);
      }, 2000);
  });

}
