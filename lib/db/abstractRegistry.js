/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:db:abstractRegistry');

class AbstractRegistry  {

  /**
   * 
   */
  keyFromString(key) {
    return key;
  }

  /**
   * 
   */
  initialize(service, callback) {
    this._service = service;
    return callback(null);
  }
  
  getMetas(path, topic, callback) {
    callback(null);
  }
  
  putMetas(path, topic, metas, callback) {
    callback(null);
  }
}

module.exports = AbstractRegistry;
