/*jslint node: true, esversion: 6 */
"use strict";

var debug = require('debug')('upnpserver:NamedSemaphore');

var Semaphore = require('./semaphore');
var NodeWeakHashmap = require('./nodeWeakHashmap');

const MAP_TIMEOUT = 1000*30;

class NamedSemaphore {
  constructor(name) {
    this._name = name;
    this._map=new NodeWeakHashmap(name, MAP_TIMEOUT);
  }
  
  get name() {
    return this._name;
  }
  
  take(name, callback) {
    var semaphore=this._map.get(name);
    if (semaphore) {
      semaphore.take(() => {
        callback(semaphore);
      });
      return;
    }
    
    semaphore = new Semaphore(this.name+":"+name);
    this._map.put({id: name}, semaphore);
    
    semaphore.take(() => {
      callback(semaphore);
    });
  }
}

module.exports = NamedSemaphore;
