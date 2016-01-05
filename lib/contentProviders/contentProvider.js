/*jslint node: true, esversion: 6 */
"use strict";

const debugHash = require('debug')('upnpserver:contentProvider:hash');
const crypto = require('crypto');

const HASH_SIZE = 1024 * 1024;

class ContentProvider {
  constructor(server, configuration) {
    this.server = server;
    this.configuration = configuration || {};
  }
  
  get isLocalFilesystem() {
    return false;
  }

  init(callback) {
    return callback(null);
  }

  /*
   * CAUTION !!!! This function must return a list of COMPLETE URL, not only the filename
   * 
   */
  list(url, callback) {
    callback(new Error("not supported (url=" + url + ")"));
  }

  /*
   * CAUTION !!!! Stat must have a file 'mime' which contains the mime type of the resource
   * 
   */
  stat(url, callback) {
    callback(new Error("not supported (url=" + url + ")"));
  }

  createReadStream(url, options, callback) {
    callback(new Error("not supported (url=" + url + ")"));
  }

  readContent(uri, encoding, callback) {
    if (arguments.length==2) {
      callback=encoding;
      encoding=undefined;
    }

    var body='';
    this.createReadStream(null, uri, {
      flags : 'r',
      encoding : encoding,
      autoClose : true,
 
    }, (error, stream) => {
      if (error) {
        return callback(error);
      }

      stream.on('data', (buffer) => body+=buffer);

      stream.on('end', () => callback(null, body));
    });  
  }
  
  _computeHash(uri, stats, callback) {

    this.createReadStream(null, uri, {
      flags : 'r',
      encoding : null,
      autoClose : true,
      start : 0,
      end : Math.min(stats.size, HASH_SIZE)

    }, (error, stream) => {
      var hash = crypto.createHash('sha256');

      hash.update(JSON.stringify({
        size : stats.size
      }));

      stream.on('data', (buffer) => hash.update(buffer));

      stream.on('end', () => {
        var digest = hash.digest("base64").replace(/=/g, '').replace(/\//g, '_');

        console.log("Hash of", uri, "=", digest);

        callback(null, digest);
      });
    });
  }
}


module.exports = ContentProvider;
