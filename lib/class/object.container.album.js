/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Container = require('./object.container');

var Album = function() {
};

Util.inherits(Album, Container);

module.exports = Album;

Album.UPNP_CLASS = Container.UPNP_CLASS + ".album";
