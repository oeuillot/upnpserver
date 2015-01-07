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

Container.prototype.toJXML = function(item, request, callback) {

  assert(item.container, "Item '" + item + "' is not a container");

  Item.prototype.toJXML.call(this, item, request, function(error, xml) {
    if (error) {
      return callback(error);
    }

    xml._name = "container";
    if (item.searchable) {
      xml._attrs.searchable = true;
    }

    var childrenIds = item._childrenIds; // 
    if (childrenIds) {
      xml._attrs.childCount = childrenIds.length;
      return callback(null, xml);
    }

    item.listChildren(function(error, list) {
      if (error) {
        return callback(error);
      }

      xml._attrs.childCount = (list)
          ? list.length : 0;
      return callback(null, xml);
    });
  });
};
