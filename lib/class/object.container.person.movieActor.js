/*jslint node: true, esversion: 6 */
"use strict";

const Person = require('./object.container.person');

class MovieActor extends Person {
  get name() { return MovieActor.UPNP_CLASS; }
}

module.exports = MovieActor;

MovieActor.UPNP_CLASS = Person.UPNP_CLASS + ".movieActor";
