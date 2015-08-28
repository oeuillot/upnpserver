/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";

var debug = require("debug")("upnpserver:statevar:event");

/*******************************************************************************************************************************
 * StateVar : implements evented and moderated stateVars getters and setters.
 * 
 * @service : service, the service instance this var belongs to
 * @name : string, name of the state variable
 * @value : mixed, default value of the variable
 * @ns : string, xmlns:dt for vendor variable
 * @evented : boolean, send event on change
 * @moderation_rate : float, minimum delay in second allowed between two events, enable moderation when set
 * @additionalProps : array of string, statevar name to be sent with this event (not realy in specs, allow event grouping)
 * @pre/post EventCb : function, callback executed before / after sending event
 * 
 */

var StateVar = module.exports = function(service, name, type, value, ns,
    evented, moderation_rate, additionalProps, preEventCb, postEventCb) {

  var self = this;

  if (value !== undefined) {
    self.value = value;

  } else {
    switch (type) {
    case "boolean":
    case "i4":
    case "iu4":
    case "iu2":
    case "i2":
    case "int":
      self.value = 0;
      break;

    // case "string":
    default:
      self.value = "";
    }

  }

  self.name = name;
  self.ns = ns;
  self.type = type;
  self.service = service;

  self.additionalProps = additionalProps || [];
  self.postEventCb = postEventCb;
  self.preEventCb = preEventCb;

  // implements set method
  if (evented && moderation_rate) {
    self.set = function(val) {
      var old = self.value;
      self.value = val;
      if (old !== val) {
        self.moderate();
      }
    };

  } else if (evented) {
    self.set = function(val) {
      var old = self.value;
      self.value = val;
      if (old !== val) {
        self.notify();
      }
    };
  } else {
    self.set = function(val) {
      self.value = val;
    };
  }

  self.rate = moderation_rate && 1000 * moderation_rate;
  self.next = moderation_rate && Date.now();
  self.wait = false;
};

/**
 * Push event xml e:property to a xmlContent array
 */
StateVar.prototype.pushEventJXML = function(where) {

  var dt = {
    "dt:dt" : this.type
  };
  if (this.ns) {
    // s-l : handle xmlns
    for ( var xmlns in this.ns) {
      dt["xmlns:" + xmlns] = this.ns[xmlns];
    }
  }
  where.push({
    _name : "e:property",
    _content : {
      _name : "s:" + this.name,
      _attrs : dt,
      _content : this.value
    }
  });
};

StateVar.prototype.get = function() {
  return this.value;
};

StateVar.prototype.notify = function() {
  var self = this;
  if (debug.enabled) {
    debug("notify " + this.name);
  }

  if (self.preEventCb) {
    self.preEventCb();
  }

  var service = self.service;
  var stateVars = service.stateVars;

  var xmlProps = [];

  self.additionalProps.forEach(function(name) {
    stateVars[name].pushEventJXML(xmlProps);
  });

  self.pushEventJXML(xmlProps);

  service.makeEvent(xmlProps);

  if (self.postEventCb) {
    self.postEventCb();
  }
};

StateVar.prototype.moderate = function() {
  var self = this;
  var now = Date.now();
  if (now > self.next) {
    if (debug.enabled) {
      debug("emit moderate " + this.name);
    }

    self.next = now + self.rate;
    self.notify();

    setTimeout(function() {
      if (debug.enabled) {
        debug("stop moderate " + self.name);
      }
      self.wait = false;
    }, self.rate);
    self.wait = true;
    return;
  }

  if (self.wait) {
    return;
  }

  if (debug.enabled) {
    debug("start moderate " + this.name);
  }

  self.next = now + self.rate;
  self.notify();
  self.wait = true;
};
