/*jslint node: true, esversion: 6 */
"use strict";

const Album = require('./object.container.album');

const _UPNP_CLASS =Album.UPNP_CLASS + ".photoAlbum"; 

class PhotoAlbum extends Album {
  get name() { return PhotoAlbum.UPNP_CLASS; }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = PhotoAlbum;
