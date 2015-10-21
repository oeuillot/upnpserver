/*jslint node: true */
"use strict";

var debug = require('debug')('upnpserver:contentHandler');

function ContentHandler() {

}

module.exports = ContentHandler;

ContentHandler.prototype.initialize = function(contentDirectoryService,
    callback) {
  this.contentDirectoryService = contentDirectoryService;

  var mimeTypes = this.mimeTypes;
  if (!mimeTypes) {
    return callback();
  }

  var self = this;

  var prepareNode = function(node) {
    var callback = arguments[arguments.length - 1];

    // console.log("node=", node);

    self.prepareNode(node, callback);
  };

  var toJXML = function(node, attributes, request, xml) {
    var callback = arguments[arguments.length - 1];

    // console.log("node=", node);

    self.toJXML(node, attributes, request, xml, callback);
  };

  var priority = this.priority;

  mimeTypes.forEach(function(mimeType) {

    if (self.prepareNode) {
      debug("Register 'prepare' for mimeType '" + mimeType + "' priority=" +
          priority);

      contentDirectoryService.asyncOn("prepare:" + mimeType, prepareNode,
          priority);
    }
    if (self.toJXML) {
      debug("Register 'toJXML' for mimeType '" + mimeType + "' priority=" +
          priority);

      contentDirectoryService.asyncOn("toJXML:" + mimeType, toJXML, priority);
    }
  });

  callback();
};

ContentHandler.prototype.prepareNode = function(node, callback) {
  callback();
};

ContentHandler.prototype.searchUpnpClass = function(fileInfos) {
  return null;
};
