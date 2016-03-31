/*jslint node: true, esversion: 6 */
"use strict";

const spawn = require('child_process').spawn;

const debug = require('debug')('upnpserver:contentHandlers:FFprobe');
const logger = require('../logger');

const Abstract_Metas = require('./abstract_metas');

class omdb extends Abstract_Metas {
  constructor(configuration) {
    super(configuration);
  }

  get name() {
    return "omdb";
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {
  }
}

module.exports = omdb;
