/*jslint node: true */
"use strict";

var Logger = {

  log : function() {
    debugger;
    throw 'Do not use Logger.log function';
  },

  trace : console.log,
  debug : console.log,
  verbose : console.log,
  info : console.info || console.log,
  warn : console.warn || console.log,
  error : console.error || console.log
};

module.exports = Logger;