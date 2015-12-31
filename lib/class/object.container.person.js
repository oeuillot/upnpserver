/*jslint node: true, esversion: 6 */
"use strict";

const Container = require('./object.container');

class Person extends Container {
  get name() { return Person.UPNP_CLASS; }
}

module.exports = Person;

Person.UPNP_CLASS = Container.UPNP_CLASS + ".person";
