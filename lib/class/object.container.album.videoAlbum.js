/*jslint node: true, esversion: 6 */
"use strict";

const Util = require('util');

const Album = require('./object.container.album');

class VideoAlbum extends Album {
  get name() { return VideoAlbum.UPNP_CLASS; }
}

module.exports = VideoAlbum;

VideoAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".videoAlbum";
