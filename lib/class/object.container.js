/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var ContentDirectoryService;

var Container = function() {
  Item.call(this);

  ContentDirectoryService = require('../contentDirectoryService');
};

Util.inherits(Container, Item);

module.exports = Container;

Container.UPNP_CLASS = "object.container";
Container.prototype.name = Container.UPNP_CLASS;

Container.prototype.isContainer = true;

Container.prototype.defaultSort = [ "+dc:title" ];

Container.prototype.toJXML = function(node, attributes, request,
    filterCallback, callback) {

  Item.prototype.toJXML.call(this, node, attributes, request, filterCallback,
      function(error, xml) {
        if (error) {
          return callback(error);
        }

        xml._name = "container";
        if (node.searchable) {
          xml._attrs.searchable = true;
        }

        var childrenIds = node.childrenIds;
        if (childrenIds) {
          // Can not filter list ! future defect ?
          xml._attrs.childCount = childrenIds.length;
          return callback(null, xml);
        }

        node.listChildren(function(error, list) {
          if (error) {
            return callback(error);
          }

          node.service.emit("filterList", request, node, list);

          xml._attrs.childCount = (list) ? list.length : 0;

          // prefetch children attributes   (low priority prefetch)
          list.forEach(function(child) {
            child.getAttributes(ContentDirectoryService.LOW_PRIORITY);
          });

          return callback(null, xml);
        });
      });
};
