/*jslint node: true */
"use strict";

var Util = require('util');

var PhotoAlbum = require('./object.container.album.photoAlbum');

var DateTaken = function() {
  PhotoAlbum.call(this);
};

Util.inherits(DateTaken, PhotoAlbum);

module.exports = DateTaken;

DateTaken.UPNP_CLASS = PhotoAlbum.UPNP_CLASS + ".dateTaken";
DateTaken.prototype.name = DateTaken.UPNP_CLASS;
