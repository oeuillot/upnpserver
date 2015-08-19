/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Genre = require('./object.container.genre');

var VideoGenre = function() {
  Genre.call(this);
};

Util.inherits(VideoGenre, Genre);

module.exports = VideoGenre;

VideoGenre.UPNP_CLASS = Genre.UPNP_CLASS + ".videoGenre";
VideoGenre.prototype.name = VideoGenre.UPNP_CLASS;
