/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

class Genre extends Container {
  get name () {
    return Genre.UPNP_CLASS;
  }
}

module.exports=Genre;

Genre.UPNP_CLASS = Container.UPNP_CLASS + ".genre";
