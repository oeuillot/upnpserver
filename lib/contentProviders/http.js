/*jslint node: true, esversion: 6 */
"use strict";

var Util = require('util');
var http = require('follow-redirects').http;
var Url = require('url');

var debug = require('debug')('upnpserver:contentProvider:Http');
var logger = require('../logger');

var ContentProvider = require('./contentProvider');

var DIRECTORY_MIME_TYPE = "application/x-directory";

class HttpContentProvider extends ContentProvider {

  /**
   * 
   */
  readdir(url, callback) {
    callback(null, []);
  }

  /**
   * 
   */
  stat(url, callback) {
    callback(null, {});
  }

  /**
   * 
   */
  createReadStream(session, url, options, callback) {

    this._prepareRequestOptions(url, options, (error, requestOptions) => {
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

      request.on('error', (error) => {
        logger("Error when loading url=",url,error);
        callback(error);
      });
    });
  }

  _prepareRequestOptions(url, options, callback) {

    var uoptions = Url.parse(url);
    uoptions.keepAlive = true;

    callback(null, uoptions);
  }
}

module.exports=HttpContentProvider;
