/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const debug = require('debug')('upnpserver:weakmap');

const logger = require('../logger');


const DELAY_MS = 500;
const MIN_DELAY_MS = 250;
const MAX_READ_COUNT = 10000/DELAY_MS;

class NodeWeakHashmap {
  constructor(name, delay, verifyUpdateId, garbageFunc) {
    this.name = name;
    this._delay = Math.max(delay || DELAY_MS, MIN_DELAY_MS);
    this._verifyUpdateId = !!verifyUpdateId;
    this._garbageFunc = garbageFunc;

    this._map = {};
    this._count = 0;
  }

  get(id, node) {
    if (!this._count) {
      return undefined;
    }

    var v = this._map[id];
    if (!v || (this._verifyUpdateId && node && v.updateId != node.updateId)) {
      return undefined;
    }

    v.readCount++;
    var d=(this._intervalId) ? this._now : (Date.now() + this._delay);
    if (v.readCount>1) {
      d += this._delay*Math.min(v.readCount-1, MAX_READ_COUNT);
    }
    v.date = d;
    return v.value;
  }

  put(node, value) {
    assert(value!==null && value!==undefined, "Invalid value");

    if (!this._intervalId) {
      this._now = Date.now() + this._delay;

      this._intervalId = setInterval(this._garbage.bind(this), this._delay);

      debug("put", "[", this.name, "] Start interval #" + this._intervalId);
    }

    var v = this._map[node.id];
    if (!v) {
      v = {};
      this._map[node.id] = v;
      this._count++;
    }

    v.date = this._now;
    v.value = value;
    v.readCount = 0;

    if (this._verifyUpdateId) {
      v.updateId = node.updateId;
    }
  }
  
  remove(node) {
    var k = node.id;
    var v = this._map[k];
    if (!v) {
      return;
    }

    delete this._map[node.id];
    this._count--;
    
    debug("remove", "[", this.name, "] Remove key", k);    
    
    var garbageFunc = this._garbageFunc;
    if (garbageFunc) {
      try {
        garbageFunc(v.value, k, v);

      } catch (x) {
        logger.error("Exception while calling garbage function ", x, x.stack);
      }
    }   
  }


  clear() {
    var map=this._map;
    this._map = {};
    this._count = 0;
    
    var garbageFunc = this._garbageFunc;
    if (garbageFunc) {
      for ( var k in map) {
        var v=map[k];

        try {
          garbageFunc(v.value, k, v);

        } catch (x) {
          logger.error("Exception while calling garbage function ", x, x.stack);
        }
      }
    }
    
    var iid = this._intervalId;
    debug("clear", "Stop interval #", iid);

    if (iid) {
      this._intervalId = undefined;
      clearInterval(iid);
    }
  }

  _garbage() {
    var now = Date.now();
    this._now = now + this._delay;

    var garbageFunc = this._garbageFunc;
    var map = this._map;
    var count = 0;
    var gs;
    for ( var k in map) {
      var v = map[k];

      if (v.date > now) {
        continue;
      }

      delete map[k];
      count++;
      this._count--;

      if (!garbageFunc) {
        continue;
      }
      if (!gs) {
        gs = [];
      }
      gs.push(v);
    }

    debug("_garbage", "[", this.name, "] Remove", count, "keys", this._count, "left");

    if (gs) {
      gs.forEach((v) => {
        try {
          garbageFunc(v.value, k, v);

        } catch (x) {
          logger.error("Exception while calling garbage function ", x, x.stack);
        }

      });
    }

    if (!this._count) {
      var iid = this._intervalId;
      debug("_garbage", "[", this.name, "] Stop interval #", iid);

      if (iid) {
        this._intervalId = undefined;
        clearInterval(iid);
      }
    }
  }
}

module.exports = NodeWeakHashmap;
