/*jslint node: true */
"use strict";

var Util = require('util');

var VideoItem = require('./object.item.videoItem');

var Movie = function() {
};

Util.inherits(Movie, VideoItem);

module.exports = Movie;

Movie.UPNP_CLASS = VideoItem.UPNP_CLASS + ".movie";
Movie.prototype.name = Movie.UPNP_CLASS;
