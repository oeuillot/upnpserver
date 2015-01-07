/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Person = require('./object.container.person');

var MusicArtist = function() {
};

Util.inherits(MusicArtist, Person);

module.exports = MusicArtist;

MusicArtist.UPNP_CLASS = Person.UPNP_CLASS + ".musicArtist";
