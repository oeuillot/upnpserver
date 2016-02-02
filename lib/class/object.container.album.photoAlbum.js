/*jslint node: true, esversion: 6 */
"use strict";

const Album = require('./object.container.album');

class PhotoAlbum extends Album {
  get name() { return PhotoAlbum.UPNP_CLASS; }
}

module.exports = PhotoAlbum;

PhotoAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".photoAlbum";
