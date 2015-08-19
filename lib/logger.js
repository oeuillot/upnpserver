/*jslint node: true */
"use strict";

var debug = require('debug')('upnpserver');

var Logger = {

  log : function() {
    debugger;
    throw 'Do not use Logger.log function';
  },

  trace : console.log.bind(console),
  debug : console.log.bind(console),
  verbose : console.log.bind(console),
  info : console.info.bind(console) || console.log.bind(console),
  warn : console.warn.bind(console) || console.log.bind(console),
  error : console.error.bind(console) || console.log.bind(console)
};

if (debug.enabled) {
  Logger.debug = debug;
  Logger.verbose = debug;
  Logger.info = debug;
  Logger.warn = debug;
  Logger.error = debug;
}

module.exports = Logger;