/*jslint node: true, esversion: 6 */
"use strict";

const Item = require('./object.item');
const ObjectClass = require('./object');

var ContentDirectoryService;

const FORCE_CHILDREN_COUNT=false;

const _UPNP_CLASS = ObjectClass.UPNP_CLASS+".container";

class Container extends Item {
  constructor() {
    super();

    if (!ContentDirectoryService) {
      ContentDirectoryService = require('../contentDirectoryService');
    }
  }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  get mimeTypes() {
    if (Object.getPrototypeOf(this)!==Container.prototype) {
      return super.mimeTypes;
    }
    return  [ 'inode/directory' ]; 
  }

  get name() {
    return Container.UPNP_CLASS;
  }

  get isContainer() { return true; }

  get defaultSort() { return [ "+dc:title" ]; }

  /**
   * 
   */
  toJXML(node, attributes, request, filterCallback, callback) {

    super.toJXML(node, attributes, request, filterCallback, (error, xml) => {
      if (error) {
        return callback(error);
      }

      xml._name = "container";
      if (node.searchable) {
        xml._attrs.searchable = true;
      }

      var childrenIds = node.childrenIds;
      if (childrenIds!==undefined) {
        // Can not filter list ! future defect ?
        xml._attrs.childCount = childrenIds.length;
        return callback(null, xml);
      }

      if (!FORCE_CHILDREN_COUNT) {
        return callback(null, xml);
      }
      
      node.browseChildren( { request: request }, (error, list) => {
        if (error) {
          return callback(error);
        }

        node.service.emit("filterList", request, node, list);

        xml._attrs.childCount = (list) ? list.length : 0;

        callback(null, xml);
      });
    });
  }
}

module.exports = Container;
