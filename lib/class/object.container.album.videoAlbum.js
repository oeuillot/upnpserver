/*jslint node: true */
"use strict";

var Util = require('util');

var Album = require('./object.container.album');

var VideoAlbum = function() {
  Album.call(this);
};

Util.inherits(VideoAlbum, Album);

module.exports = VideoAlbum;

VideoAlbum.UPNP_CLASS = Album.UPNP_CLASS + ".videoAlbum";
VideoAlbum.prototype.name = VideoAlbum.UPNP_CLASS;
