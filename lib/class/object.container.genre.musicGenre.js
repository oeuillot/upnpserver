/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Genre = require('./object.container.genre');

var MusicGenre = function() {
};

Util.inherits(MusicGenre, Genre);

module.exports = MusicGenre;

MusicGenre.UPNP_CLASS = Genre.UPNP_CLASS + ".musicGenre";
