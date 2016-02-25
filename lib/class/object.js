/*jslint node: true, sub: true, esversion: 6 */
"use strict";

const assert = require('assert');
const debug = require('debug')('upnpserver:class:object.item');
const Xmlns = require('../xmlns');

const _UPNP_CLASS = "object";

class ObjectClass {

  get name() {
    return ObjectClass.UPNP_CLASS;
  }

  get isContainer() { 
    return false; 
  }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }


  /**
   * 
   */
  toString() {
    return "[UpnpClass " + this.name + "]";
  }

  /**
   * @param {subclass|string}
   * @return {boolean}
   */
  isSubClassOf(subclass) {
    if (subclass instanceof ObjectClass) {
      subclass=subclass.name;
    }

    return (subclass.indexOf(this.name)===0);
  }
}

module.exports = ObjectClass;
