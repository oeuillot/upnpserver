/*jslint node: true */
"use strict";

var Util = require('util');

var Album = require('./object.container.album');

var PhotoAlbum = function() {
};

Util.inherits(PhotoAlbum, Album);

module.exports = PhotoAlbum;

PhotoAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".photoAlbum";
PhotoAlbum.prototype.name = PhotoAlbum.UPNP_CLASS;
