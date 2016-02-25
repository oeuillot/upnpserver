/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

const _UPNP_CLASS=Container.UPNP_CLASS + ".album";

class Album extends Container {
  get name() { return Album.UPNP_CLASS; }
  get defaultSort() { return [ "+upnp:originalTrackNumber", "+dc:title" ];}

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = Album;
