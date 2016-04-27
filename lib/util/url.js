/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const debug = require('debug')('upnpserver:URL');
const Path = require('path');

const Mime = require('mime');

/**
 * @author Olivier Oeuillot
 */
class URL {

  constructor(contentProvider, path) {
    assert(contentProvider, "Invalid contentProvider parameter");
    assert(typeof(path)==='string', "Invalid path parameter");
    
    Object.defineProperty(this, "contentProvider", {
      enumerable: false,
      configurable: false,
      writable: false,
      value: contentProvider
    });

    Object.defineProperty(this, "contentProviderName", {
      enumerable: true,
      configurable: false,
      writable: false,
      value: contentProvider.name
    });

    Object.defineProperty(this, "path", {
      enumerable: true,
      configurable: false,
      writable: false,
      value: path
    });
    
  }
  
  get basename() {
    return Path.posix.basename(this.path);
  }
  
  changeBasename(newBaseName) {
    return this.join('..', newBaseName);
  }
  
  join() {
    var args=_concatPath(this.path, arguments);

    var newURL = this.contentProvider.join.apply(this.contentProvider, args);
    
    return new URL(this.contentProvider, newURL);
  }
  
  stat() {
    var args=_concatPath(this.path, arguments);

    this.contentProvider.stat.apply(this.contentProvider, args);
  }
  
  createReadStream(session, options, callback) {
    this.contentProvider.createReadStream(session, this.path, options, callback);
  }

  createWriteStream(options, callback) {
    this.contentProvider.createWriteStream(this.path, options, callback);
  }

  readContent() {
    var args=_concatPath(this.path, arguments);
    
    debug("readContent", "parameters=",args);

    this.contentProvider.readContent.apply(this.contentProvider, args);
  }

  writeContent() {
    var args=_concatPath(this.path, arguments);
    
    debug("writeContent", "parameters=",args);

    this.contentProvider.writeContent.apply(this.contentProvider, args);
  }
 
  mimeLookup() {
    return Mime.lookup(this.basename);
  }
  
  readdir(callback) {
    this.contentProvider.readdir(this.path, callback);
  }
  
  toString() {
    var protocol = this.contentProvider.protocol;
    
    if (!protocol) {
      return this.path;
    }
    return protocol+":"+this.path;
  }
}

function _concatPath(path, args) {
  var a=[path];
  a.push.apply(a,args);
  
  return a;
}

module.exports = URL;
