/*jslint node: true */
"use strict";

var Async = require('async');

function AsyncEventEmitter() {
  this._eventsByName = {};
  this._maxListeners = 10;
  this._defaultPriority = 50;
}

module.exports = AsyncEventEmitter;

AsyncEventEmitter.prototype.setMaxListeners = function(n) {
  this._maxListeners = isNaN(n) ? 10 : n;
  return this;
};

AsyncEventEmitter.prototype.listeners = function(name) {
  var eventsByName = this._eventsByName;

  var events = eventsByName[name];
  if (!events) {
    events = [];
    eventsByName[name] = events;
  }

  return events;
};

AsyncEventEmitter.prototype.asyncOn = function(name, func, priority) {
  var l = this.listeners(name);

  if (typeof (func) !== 'function') {
    throw new Error('The event listener MUST be a function. You passed in a ' +
        typeof func);
  }

  if (l.length >= this._maxListeners) {
    console.error('Error: Too many listeners!! This may be a bug in your code');
  }

  priority = (typeof (priority) === 'number') ? priority : this._defaultPriority;
  l.push({
    priority : priority,
    func : func
  });

  l.sort(function(f1, f2) {
    return f1.priority - f2.priority;
  });

  return this;
};

AsyncEventEmitter.prototype.asyncOnce = function(name, func, priority) {

  var onceFunc = function() {
    this.removeListener(name, func);

    func.apply(this, arguments);

  }.bind(this);

  this.on(name, onceFunc, priority);
  return this;
};

AsyncEventEmitter.prototype.asyncRemoveListener = function(name, func) {
  var l = this.listeners(name);

  for (var i = 0; i < l.length; i++) {
    if (l[i] !== func) {
      continue;
    }

    l.splice(i, 1);
  }
  return this;
};

AsyncEventEmitter.prototype.asyncEmit = function(name, x, xcallback) {
  var callback = arguments[arguments.length - 1];

  var l = this.listeners(name);
  if (!l || !l.length) {
    return callback();
  }

  var args = Array.prototype.slice.call(arguments, 1, arguments.length - 1);
  var argsLength = args.length;

  var self = this;
  Async.eachSeries(l, function(listener, callback) {
    args[argsLength] = function(error) {
      if (error) {
        return callback(error);
      }
      setImmediate(callback);
    };

    listener.func.apply(self, args);

  }, function(error) {
    if (error && error !== false) {
      return callback(error);
    }

    setImmediate(callback.bind(self, error));
  });
};
