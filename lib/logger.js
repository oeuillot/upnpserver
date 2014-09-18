/*jslint node: true */
"use strict";

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

module.exports = Logger;