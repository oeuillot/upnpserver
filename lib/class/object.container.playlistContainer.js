/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Container = require('./object.container');

var PlaylistContainer = function() {
};

Util.inherits(PlaylistContainer, Container);

module.exports = PlaylistContainer;

PlaylistContainer.UPNP_CLASS = Container.UPNP_CLASS + ".playlistContainer";
PlaylistContainer.prototype.name = PlaylistContainer.UPNP_CLASS;
