/*jslint node: true, esversion: 6 */
"use strict";

const Person = require('./object.container.person');

class MusicArtist extends Person {
  get name() { return MusicArtist.UPNP_CLASS; }
}

module.exports = MusicArtist;

MusicArtist.UPNP_CLASS = Person.UPNP_CLASS + ".musicArtist";
