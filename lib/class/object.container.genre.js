/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Container = require('./object.container');

var Genre = function() {
};

Util.inherits(Genre, Container);

module.exports = Genre;

Genre.ParentClass = Container;
Genre.UPNP_CLASS = Genre.ParentClass.UPNP_CLASS + ".genre";
