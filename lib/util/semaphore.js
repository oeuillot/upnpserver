/*jslint node: true, esversion: 6 */
"use strict";

var debug = require('debug')('upnpserver:Semaphore');

class Semaphore {

  constructor(name) {
    this._name=name;
  }

  take(func) {
    //console.log("["+this._name+"] Take semaphore (taken="+this._taken+")");
    if (!this._taken) {
      this._taken=true;
      func(this);
      return;
    }

    if (!this._waitings) {
      this._waitings=[];
    }

    this._waitings.push(func);
  }

  leave() {
    if (!this._waitings || !this._waitings.length) {
      //console.log("["+this._name+"] Release semaphore EMPTY");
      this._taken=false;
      return;
    }
    
    var f=this._waitings.shift();

    //console.log("["+this._name+"] Release semaphore shift "+this._waitings);

    setImmediate(f.call(this, this));
  }

  get current() {
    if (!this._taken) {
      return 0;
    }

    if (!this._waitings) {
      return 1;
    }

    return this._waitings.length+1;
  }
}

module.exports = Semaphore;
