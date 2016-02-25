/*jslint node: true, esversion: 6 */
"use strict";

const Person = require('./object.container.person');

const _UPNP_CLASS = Person.UPNP_CLASS + ".musicArtist";

class MusicArtist extends Person {
  get name() { return MusicArtist.UPNP_CLASS; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = MusicArtist;
