/*jslint node: true, esversion: 6 */
"use strict";

var debug = require('debug')('upnpserver:contentHandler');

class ContentHandler {

  initialize(contentDirectoryService, callback) {
    this.contentDirectoryService = contentDirectoryService;

    var mimeTypes = this.mimeTypes;
    if (!mimeTypes) {
      return callback();
    }

    var self=this;
    
    var prepareNode = function(node) {
      var callback = arguments[arguments.length - 1];

      debug("PrepareNode event, node #",node.id, callback);
      // console.log("node=", node);

      self.prepareNode(node, (error) => {
        debug("PrepareNode event, node #",node.id,"returns",error);
        callback(error);
      });
    };

    var toJXML = function(node, attributes, request, xml) {
      var callback = arguments[arguments.length - 1];

      debug("toJXML event #",node.id);

      // console.log("node=", node);

      self.toJXML(node, attributes, request, xml, callback);
    };

    var priority = this.priority;

    mimeTypes.forEach((mimeType) => {

      if (this.prepareNode) {
        debug("Register 'prepare' for mimeType '" + mimeType + "' priority=" +
            priority);

        contentDirectoryService.asyncOn("prepare:" + mimeType, prepareNode,
            priority);
      }

      if (this.toJXML) {
        debug("Register 'toJXML' for mimeType '" + mimeType + "' priority=" +
            priority);

        contentDirectoryService.asyncOn("toJXML:" + mimeType, toJXML, priority);
      }
    });

    callback();
  }

  /*
  prepareNode(node, callback) {
    callback();
  }*/

  searchUpnpClass(fileInfos) {
    return null;
  }

}

module.exports = ContentHandler;
