/*jslint node: true, esversion: 6 */
"use strict";

var debug= require('debug')('upnpserver:AsyncEventEmitter');

var Async = require('async');
var EventEmitter = require('events').EventEmitter;
var Util = require('util');

class AsyncEventEmitter extends EventEmitter {
  constructor() {
    super();

    this._eventsByName = {};
    this._asyncMaxListeners = 10;
    this._defaultPriority = 50;
  }

  setMaxListeners(n) {
    this._asyncMaxListeners = isNaN(n) ? 10 : n;
    return this;
  }

  listeners(name) {
    var eventsByName = this._eventsByName;

    var events = eventsByName[name];
    if (!events) {
      events = [];
      eventsByName[name] = events;
    }

    return events;
  }

  asyncOn(name, func, priority) {

    var l = this.listeners(name);

    if (typeof (func) !== 'function') {
      throw new Error('The event listener MUST be a function. You passed in a ' +
          typeof func);
    }

    if (l.length >= this._asyncMaxListeners) {
      console.error('Error: Too many listeners!! This may be a bug in your code');
    }

    priority = (typeof (priority) === 'number') ? priority : this._defaultPriority;
    l.push({
      priority : priority,
      func : func
    });

    l.sort((f1, f2) => {
      return f1.priority - f2.priority;
    });

    this.emit('newAsyncListener', name, func);

    return this;
  }

  asyncOnce(name, func, priority) {

    var fired = false;
    var onceFunc = () => {
      this.asyncRemoveListener(name, func);

      if (fired) {
        return;
      }
      fired = true;

      func.apply(this, arguments);
    };

    this.asyncOn(name, onceFunc, priority);
    return this;
  }

  asyncRemoveListener(name, func) {
    var l = this.listeners(name);

    for (var i = 0; i < l.length; i++) {
      if (l[i] !== func) {
        continue;
      }

      l.splice(i, 1);

      this.emit('removeAsyncListener', name, func);
      break;
    }

    return this;
  }

  hasListeners(name) {
    var l = this._eventsByName[name];
    if (!l || !l.length) {
      return false;
    }

    return true;
  }

  asyncEmit(name, x, xcallback) {
    var callback = arguments[arguments.length - 1];

    var l = this.listeners(name);

    if (!l || !l.length) {

      debug("asyncEmit name=",name," EMPTY list");

      return callback();
    }

    var args = Array.prototype.slice.call(arguments, 1, arguments.length - 1);
    var argsLength = args.length;

    debug("asyncEmit name=",name,"l=",l); //,"args=",args);

    Async.eachSeries(l, (listener, callback) => {
      args[argsLength] = (error) => {
        debug("Call of listener returns ",error);
        callback();
      };

      debug("Call listener=",listener); //, "args=",args);

      listener.func.apply(this, args);

    }, (error) => {
      debug("End of asyncEmit name=",name, "error=",error);

      if (error && error !== false) {
        return callback(error);
      }

      setImmediate(callback.bind(this, error));
    });
  }
}

module.exports = AsyncEventEmitter;
