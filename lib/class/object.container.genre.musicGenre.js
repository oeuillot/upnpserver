/*jslint node: true, esversion: 6 */
"use strict";

const Genre = require('./object.container.genre');

const _UPNP_CLASS = Genre.UPNP_CLASS + ".musicGenre"; 

class MusicGenre extends Genre {
  get name() { return MusicGenre.UPNP_CLASS; }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = MusicGenre;
