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
  if (evented === 2){
    // implements LastChange event model
    self.set = function(val) {
      var old = self.value;
      self.value = val;
      if (old !== val) {
        self.lastChange();
      }
    }
  } else if (evented && moderation_rate) {
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

  var service   = self.service;
  var stateVars = service.stateVars;

  if (self.name === "LastChange"){
    service.sendEvent("upnp:propchange", this.value);
    this.value = {
     _name:"Event",
     _attr:{"xmlns":this.service.eventNameSpace}
     _content : []
    };
    if (self.postEventCb) {
      self.postEventCb();
    }
    return;
  }

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
/*
 *  Lastchange event model See section 5 in
 * http://upnp.org/specs/av/UPnP-av-RenderingControl-v1-Service.pdf
 */
/*
 <Event xmlns=”urn:schemas-upnp-org:metadata-1-0/AVT_RCS">
    <InstanceID val=”0”>
      <Brightness val=”36”/>
      <Contrast val=”54”/>
      ...
    </InstanceID>
    <InstanceID val=”1”>
      <Mute channel=”Master” val=”0”/>
      <Volume channel=”CF”val=”24”/>
      ...
    </InstanceID>
 */

StateVar.prototype.lastChange = function(value){
   var self = this;
   var InstanceID = self.service.stateVars["A_ARG_TYPE_InstanceID"].get();
   // find instance 0 and use the LastChange var on this instance
   var route = self.service.route;
   var index = route.indexOf(InstanceID);
   if (index > -1) {
     route = route.substr(0, index-1);
   }
   var LastChange = self.service.device.services[route].stateVars["LastChange"];
   var lastJXML = LastChange.get();
   if (!lastJXML){
     lastJXML = {
      _name:"Event",
      _attr:{"xmlns":this.service.eventNameSpace}
      _content : []
    };
  }
  var _content = lastJXML._content;
   // find if there is an event prop set for this instance
   var instance;
   for (var i = 0; i< _content.length; i++){
     if (_content[i]._attrs["val"] == InstanceID){
       instance = _content[i]._content;
       break;
     }
   }
   if (!instance){
     var newinstance = {
       _name: "InstanceID",
       _attrs: {val:InstanceID},
       _content : []
     };
     instance = newinstance._content;
     _content.push(instance);
   }
   // update value of prop if there is an event prop allready set
   var found = false;
   for (var i=0; i< instance.length){
     if (instance[i].name == this.name){
       found = true;
       instance[i]._attrs["val"] = this.value;
       break;
     }
   }
   if (!found){
     instance.push({
       _name : this.name,
       _attrs : {val: this.value},
     })
   }

   LastChange.set(lastJXML);
}
