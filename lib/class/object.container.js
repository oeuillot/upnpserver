/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');

var Container = function() {
};

Util.inherits(Container, Item);

module.exports = Container;

Container.UPNP_CLASS = "object.container";
Container.prototype.name = Container.UPNP_CLASS;

Container.prototype.isContainer = true;

Container.prototype.defaultSort = [ "+dc:title" ];

Container.prototype.toJXML = function(node, request, callback) {

  Item.prototype.toJXML.call(this, node, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    xml._name = "container";
    if (node.searchable) {
      xml._attrs.searchable = true;
    }

    var childrenIds = node._childrenIds;
    if (childrenIds) {
      xml._attrs.childCount = childrenIds.length;
      return callback(null, xml);
    }

    node.listChildren({
      countOnly : true

    }, function(error, list) {
      if (error) {
        return callback(error);
      }

      xml._attrs.childCount = (list) ? list.length : 0;
      return callback(null, xml);
    });
  });
};
