/*jslint node: true, esversion: 6 */
"use strict";

const Genre = require('./object.container.genre');

class VideoGenre extends Genre {
  get name() { return VideoGenre.UPNP_CLASS; }  
}

module.exports = VideoGenre;

VideoGenre.UPNP_CLASS = Genre.UPNP_CLASS + ".videoGenre";
