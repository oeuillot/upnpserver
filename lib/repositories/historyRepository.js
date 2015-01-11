/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Util = require('util');
var Async = require("async");
var _ = require('underscore');

var Item = require('./node');
var logger = require('./logger');
var Repository = require('./repository');

var FILES_PROCESSOR_LIMIT = 4;

var HistoryRepository = function(repositoryId, mountPath, path,
    perHostHistorySize, allHostHistorySize) {
  Repository.call(this, repositoryId, mountPath, path);

  if (!perHostHistorySize || perHostHistorySize < 0) {
    perHostHistorySize = 0;
  }
  if (!allHostHistorySize || allHostHistorySize < 0) {
    allHostHistorySize = 0;
  }

  this.perHostHistorySize = perHostHistorySize;
  this.allHostHistorySize = allHostHistorySize;
};

Util.inherits(HistoryRepository, Repository);

module.exports = HistoryRepository;

HistoryRepository.prototype.initialize = function(service, callback) {

  var self = this;

  Repository.prototype.initialize.call(this, service, function(error, item) {
    if (error) {
      return callback(error);
    }

    // Root node of history
    
    if (self.perHostHistorySize) {
      
    }
    

    callback(null, item);
  });
};
