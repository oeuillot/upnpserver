/*jslint node: true, esversion: 6 */
"use strict";

const Genre = require('./object.container.genre');

class MusicGenre extends Genre {
  get name() { return MusicGenre.UPNP_CLASS; }
}

module.exports = MusicGenre;

MusicGenre.UPNP_CLASS = Genre.UPNP_CLASS + ".musicGenre";
