/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Person = require('./object.container.person');

var MovieActor = function() {
};

Util.inherits(MovieActor, Person);

module.exports = MovieActor;

MovieActor.UPNP_CLASS = Person.UPNP_CLASS + ".movieActor";
MovieActor.prototype.name = MovieActor.UPNP_CLASS;
