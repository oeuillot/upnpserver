/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Item = require('./object.item');
var Container = require('./object.container');

var Person = function() {
};

Util.inherits(Person, Container);

module.exports = Person;

Person.UPNP_CLASS = Container.UPNP_CLASS + ".person";
