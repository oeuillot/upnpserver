/*jslint node: true, esversion: 6 */
"use strict";

const PhotoAlbum = require('./object.container.album.photoAlbum');

class DateTaken extends PhotoAlbum {
  get name() { return DateTaken.UPNP_CLASS; }
}

module.exports = DateTaken;

DateTaken.UPNP_CLASS = PhotoAlbum.UPNP_CLASS + ".dateTaken";
