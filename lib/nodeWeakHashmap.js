/*jslint node: true, plusplus:true */
"use strict";

var logger = require('./logger');

var debug = require('debug')('upnpserver:weakmap');

var DELAY_MS = 500;
var MIN_DELAY_MS = 250;

function NodeWeakHashmap(name, delay, verifyUpdateId, garbageFunc) {
  this.name = name;
  this._delay = Math.min(delay || DELAY_MS, MIN_DELAY_MS);
  this._verifyUpdateId = !!verifyUpdateId;
  this._garbageFunc = garbageFunc;

  this._map = {};
  this._count = 0;
}

NodeWeakHashmap.prototype.get = function(node) {
  if (!this._count) {
    return undefined;
  }

  var v = this._map[node.id];
  if (!v || (this._verifyUpdateId && v.updateId != node.updateId)) {
    return undefined;
  }

  return v.value;
};

NodeWeakHashmap.prototype.put = function(node, value) {

  if (!this._intervalId) {
    this._now = Date.now() + this._delay;

    this._intervalId = setInterval(this._garbage.bind(this), this._delay);

    debug("Start interval #" + this._intervalId);
  }

  var v = this._map[node.id];
  if (!v) {
    v = {};
    this._map[node.id] = v;
    this._count++;
  }

  v.date = this._now;
  v.value = value;

  if (this._verifyUpdateId) {
    v.updateId = node.updateId;
  }
};

NodeWeakHashmap.prototype._garbage = function() {
  var now = Date.now();
  this._now = now + this._delay;

  var garbageFunc = this._garbageFunc;
  var map = this._map;
  var count = 0;
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

    try {
      garbageFunc(k, v.date, v.updateId, v.value);

    } catch (x) {
      logger.error("Exception while calling garbage function ", x);
    }
  }

  if (debug.enabled) {
    debug("Remove " + count + " keys " + this._count + " left");
  }

  if (!this._count) {
    var iid = this._intervalId;
    debug("Stop interval #" + iid);

    if (iid) {
      this._intervalId = undefined;
      clearInterval(iid);
    }
  }
};

module.exports = NodeWeakHashmap;
