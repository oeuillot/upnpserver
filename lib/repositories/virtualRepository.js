/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:repositories:Virtual');

const Repository = require('./repository');

class VirtualRepository extends Repository {
  constructor(mountPath, searchClasses) {
    super(mountPath);

    this.searchClasses = searchClasses;
  }


  /**
   * 
   */
  browse(list, node, callback) {

    this.mountNode = node;

    if (this.searchClasses) {
      this.searchClasses.forEach((sc) => {
        node.addSearchClass(sc.name, sc.includeDerived);
      });
    }

    callback();
  }

  /**
   * 
   */
  newFile(parentNode, path, upnpClass, stats, attributes, prepared, before, callback) {
    parentNode = parentNode || this.mountNode;

    super.newFile(parentNode, path, upnpClass, stats, attributes, prepared, before, callback);
  }

  /**
   * 
   */
  newFolder(parentNode, path, upnpClass, stats, attributes, before, callback) {
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

    super.newFolder(parentNode, path, upnpClass, stats, attributes, before, callback);
  }

  /**
   * 
   */
  newVirtualContainer(parentNode, name, upnpClass, attributes, before, callback) {
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

    super.newVirtualContainer(parentNode, name,
        upnpClass, attributes, before, callback);
  }
}

module.exports = VirtualRepository;
