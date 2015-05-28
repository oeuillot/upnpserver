/*jslint node: true, nomen: true */
"use strict";

var Util = require('util');
var http = require('follow-redirects').http;
var Url = require('url');

var debug = require('debug')('upnpserver:contentProvider:http');
var logger = require('../logger');

var ContentProvider = require('./contentProvider');

var DIRECTORY_MIME_TYPE = "application/x-directory";

function HttpContentProvider(server, configuration) {
  ContentProvider.call(this, server, configuration);
}

Util.inherits(HttpContentProvider, ContentProvider);

module.exports = HttpContentProvider;

HttpContentProvider.prototype.readdir = function(url, callback) {

};

HttpContentProvider.prototype.stat = function(url, callback) {

};

HttpContentProvider.prototype.createReadStream = function(url, options,
    callback) {

  this._prepareRequestOptions(function(error, requestOptions) {
    if (error) {
      return callback(error);
    }

    var request = http.request(requestOptions);

    request.on('response', function(response) {
      if (Math.floor(response.statusCode / 100) !== 2) {
        return callback(new Error("Invalid status '" + response.statusCode +
            "' message='" + response.statusMessage + "' for url=" + url));
      }

      callback(null, response);
    });

    request.on('error', function(error) {
      callback(error + " for url=" + url);
    });
  });
};

HttpContentProvider.prototype._prepareRequestOptions = function(url, callback) {

  var options = Url.parse(url);
  options.keepAlive = true;

  callback(null, options);
};
