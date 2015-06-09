/*jslint node: true, vars: true, nomen: true */
"use strict";

var debug = require('debug')('upnpserver:class:object.item');

var Item = function() {
};

module.exports = Item;

Item.UPNP_CLASS = "object.item";
Item.prototype.name = Item.UPNP_CLASS;

Item.prototype.prepareNode = function(node, callback) {

  return callback();
};

Item.prototype.toJXML = function(node, request, callback) {

  var attributes = node.attributes;

  var content = (node.attrs) ? node.attrs.slice(0) : [];

  var xml = {
    _name : "item",
    _attrs : {
      id : node.id,
      parentID : node.parentId,
      restricted : (attributes.restricted === false) ? "0" : "1"
    },
    _content : content
  };

  if (attributes.searchable !== undefined) {
    xml._attrs.searchable = (attributes.searchable) ? "1" : "0";
  }

  var scs = attributes.searchClasses;
  if (attributes.searchable && scs) {
    scs.forEach(function(sc) {
      content.push({
        _name : "upnp:searchClass",
        _attrs : {
          includeDerived : (sc.includeDerived ? "1" : "0")
        },
        _content : sc.name
      });
    });
  }

  var title = attributes.title;
  content.push({
    _name : "dc:title",
    _content : title || node.name
  });

  if (node.upnpClass) {
    content.push({
      _name : "upnp:class",
      _content : node.upnpClass.name
    });
  }
  var date = attributes.date;
  if (date) {
    if (typeof (date) === "number") {
      date = new Date(date);
    }
    content.push({
      _name : "dc:date",
      _content : Item.toISODate(date)
    });
  }

  return callback(null, xml);
};

Item.prototype.processRequest = function(node, request, response, path,
    parameters, callback) {

  var contentHandlerKey = parameters.contentHandler;
  if (contentHandlerKey !== undefined) {
    var contentHandler = node.service.contentHandlersById[contentHandlerKey];

    if (debug.enabled) {
      debug("ContentHandler key=", contentHandlerKey, " handler=",
          contentHandler);
    }

    if (!contentHandler) {
      response
          .writeHead(404, 'Content handler not found: ' + contentHandlerKey);
      response.end();
      return callback(null, true);
    }

    contentHandler.processRequest(node, request, response, path, parameters,
        callback);
    return;
  }

  callback(null, false);
};

Item._getNode = function(node, name) {
  var content = node._content;
  for (var i = 0; i < content.length; i++) {
    if (content[i]._name === name) {
      return content[i];
    }
  }

  var n = {
    _name : name
  };
  content.push(n);

  return n;
};

Item.toISODate = function(date) {
  return date.toISOString().replace(/\..+/, '');
};

Item.prototype.toString = function() {
  return "[UpnpClass " + this.name + "]";
};
