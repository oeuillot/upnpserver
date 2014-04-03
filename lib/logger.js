/*jslint node: true */
"use strict";

var Logger = {

  log : function() {
    debugger;
    throw 'Do not use Logger.log function';
  },

  silly : console.log,
  debug : console.log,
  verbose : console.log,
  info : console.info,
  warn : console.warn,
  error : console.error
};

module.exports = Logger;