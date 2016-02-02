/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

class Album extends Container {
  get name() { return Album.UPNP_CLASS; }
  get defaultSort() { return [ "+upnp:originalTrackNumber", "+dc:title" ];}
}

module.exports = Album;

Album.UPNP_CLASS = Container.UPNP_CLASS + ".album";
