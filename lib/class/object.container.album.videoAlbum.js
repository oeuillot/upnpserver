/*jslint node: true, esversion: 6 */
"use strict";

const Util = require('util');

const Album = require('./object.container.album');

const _UPNP_CLASS = Album.UPNP_CLASS + ".videoAlbum"; 

class VideoAlbum extends Album {
  get name() { return VideoAlbum.UPNP_CLASS; }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = VideoAlbum;
