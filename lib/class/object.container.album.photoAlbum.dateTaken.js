/*jslint node: true, esversion: 6 */
"use strict";

const PhotoAlbum = require('./object.container.album.photoAlbum');

const _UPNP_CLASS = PhotoAlbum.UPNP_CLASS + ".dateTaken";

class DateTaken extends PhotoAlbum {
  get name() { return DateTaken.UPNP_CLASS; }
  
  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = DateTaken;
