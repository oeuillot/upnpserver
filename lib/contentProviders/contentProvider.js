/*jslint node: true */
"use strict";

function ContentProvider(service, configuration) {
  this.service = service;
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

/**
 *  Monitor whatever changes (filesystem..)
 *  See file.js as monitor sample
 */
ContentProvider.prototype.monitor = function(repository) {
  return false;
};
