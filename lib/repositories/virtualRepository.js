/*jslint node: true */
"use strict";

var Util = require('util');

var debug = require('debug')('upnpserver:virtualRepository');

var Repository = require('./repository');


var VirtualRepository = function(configuration) {

  assert(typeof configuration.mountPoint === "string", "Invalid mountPoint parameter '" +
      configuration.mountPoint +
      "'");

  assert(typeof configuration.searchClasses === "object", "Invalid searchClasses parameter '" +
      configuration.searchClasses +
      "'");

  var searchClasses= configuration.searchClasses;

  Repository.call(this, configuration);

  this.searchClasses = searchClasses;
};

Util.inherits(VirtualRepository, Repository);

module.exports = VirtualRepository;

VirtualRepository.prototype.browse = function(list, node, callback) {

  this.mountNode = node;

  if (this.searchClasses) {
    this.searchClasses.forEach(function(sc) {
      node.addSearchClass(sc.name, sc.includeDerived);
    });
  }

  callback();
};

VirtualRepository.prototype.newFile = function(parentNode, path, upnpClass,
    stats, attributes, before, callback) {
  parentNode = parentNode || this.mountNode;

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = stats;
    stats = undefined;
    break;
  case 5:
    callback = attributes;
    attributes = undefined;
    break;
  case 6:
    callback = before;
    before = undefined;
    break;
  }

  Repository.prototype.newFile.call(this, parentNode, path, upnpClass, stats,
      attributes, before, callback);
};

VirtualRepository.prototype.newFolder = function(parentNode, path, upnpClass,
    stats, attributes, before, callback) {
  parentNode = parentNode || this.mountNode;

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = stats;
    stats = undefined;
    break;
  case 5:
    callback = attributes;
    attributes = undefined;
    break;
  case 6:
    callback = before;
    before = undefined;
    break;
  }

  Repository.prototype.newFolder.call(this, parentNode, path, upnpClass, stats,
      attributes, before, callback);
};

VirtualRepository.prototype.newVirtualContainer = function(parentNode, name,
    upnpClass, attributes, before, callback) {
  parentNode = parentNode || this.mountNode;

  switch (arguments.length) {
  case 3:
    callback = upnpClass;
    upnpClass = undefined;
    break;
  case 4:
    callback = attributes;
    attributes = undefined;
    break;
  case 5:
    callback = before;
    before = undefined;
    break;
  }

  Repository.prototype.newVirtualContainer.call(this, parentNode, name,
      upnpClass, attributes, before, callback);
};
