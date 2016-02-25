/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

const _UPNP_CLASS = Container.UPNP_CLASS + ".genre"; 

class Genre extends Container {
  get name () {
    return Genre.UPNP_CLASS;
  }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports=Genre;
