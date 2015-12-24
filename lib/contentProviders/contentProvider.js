/*jslint node: true */
"use strict";

var debugHash = require('debug')('upnpserver:contentProvider:hash');
var crypto = require('crypto');

var HASH_SIZE = 1024 * 1024;

function ContentProvider(server, configuration) {
  this.server = server;
  this.configuration = configuration || {};
}

module.exports = ContentProvider;

ContentProvider.prototype.init = function(callback) {
  return callback(null);
};

/*
 * CAUTION !!!! This function must return a list of COMPLETE URL, not only the filename
 * 
 */
ContentProvider.prototype.list = function(url, callback) {
  callback(new Error("not supported (url=" + url + ")"));
};

/*
 * CAUTION !!!! Stat must have a file 'mime' which contains the mime type of the resource
 * 
 */
ContentProvider.prototype.stat = function(url, callback) {
  callback(new Error("not supported (url=" + url + ")"));
};

ContentProvider.prototype.createReadStream = function(url, options, callback) {
  callback(new Error("not supported (url=" + url + ")"));
};

ContentProvider.prototype._computeHash = function(uri, stats, callback) {

  this.createReadStream(null, uri, {
    flags : 'r',
    encoding : null,
    autoClose : true,
    start : 0,
    end : Math.min(stats.size, HASH_SIZE)

  }, function(error, stream) {
    var hash = crypto.createHash('sha256');

    hash.update(JSON.stringify({
      size : stats.size
    }));

    stream.on('data', function(buffer) {
      hash.update(buffer);
    });

    stream.on('end', function() {
      var digest = hash.digest("base64").replace(/=/g, '').replace(/\//g, '_');

      console.log("Hash of", uri, "=", digest);

      callback(null, digest);
    });
  });
};