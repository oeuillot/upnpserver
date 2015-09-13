/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";

var debug = require("debug")("upnpserver:statevar:event");

/**
 * StateVar : implements evented and moderated stateVars getters and setters.
 *            support for LastChange event model (cds3 avt mr ..)
 *
 * @param {service}         service  : the service instance this var belongs to
 * @param {string}          name     : name of the state variable
 * @param {string}          type     : upnp type of the state variable
 * @param {int}             errCode  : associated soap error code (default 600)
 * @param {mixed}           value    : default value of the variable
 * @param {array|object}    valueList: array list of strings allowed values
 *                                     object range {minimum:, maximum:, step:}
 * @param {object}          ns       : xmlns {xmlns:nsdeclaration}
 * @param {boolean|integer} evented  : [0|false|null] don't send event
 *                                     [1|true] send event on change
 *                                     [2]      lastChange event model
 * @param {float}           moderation_rate : minimum delay in second allowed
 *                          between two events, enable moderation when set
 * @param {array}           additionalProps : array of string, statevar name
 *                          to be sent with this event
 *                          (not realy in specs, allow event grouping)
 * @param {function}        pre/post EventCb : callback executed before / after
 *                          sending event
 */
var StateVar = module.exports = function(service, name, type, errCode, val,
  valueList, ns, evented, moderation_rate, additionalProps, preEventCb, postEventCb) {

  var self = this;


  if (val !== undefined) {
    this.value = val;

  } else {
    switch (type) {
    case "boolean":
    case "ui1":
    case "ui2":
    case "ui4":
    case "i1":
    case "i2":
    case "i4":
    case "int":
    case "r4":
    case "r8":
    case "number":
    case "fixed.14.4":
    case "float":
      this.value = 0;
      break;

    // case "string":
    default:
      this.value = "";
    }

  }

  self.name = name;
  self.ns = ns;
  self.type = type;
  self.service = service;
  self.valueList = [];
  self.range = null;

  // use valueList as range
  if (valueList !== null && typeof valueList === 'object' && valueList.minimum && valueList.maximum){

    self.range = valueList;

  } else {
    self.valueList = valueList || [];
  }

  self.errCode = errCode || 600;
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

StateVar.prototype.get = function(){
  return this.value;
}
/*
  StateVar.prototype.create = function(service, name, type, errCode, val,
    valueList, ns, evented, moderation_rate, additionalProps, preEventCb, postEventCb){

    var stateVar = new StateVar(service, name, type, errCode, val,
      valueList, ns, evented, moderation_rate, additionalProps, preEventCb, postEventCb)

    // standard accessors
    // one can still use .set() to prevent event fire
    Object.defineProperty(service.stateVars, name, {
        get : function(){ return self.get(); },
        set : function(val){ self.set(val); },
        enumerable : true,
        configurable : true});
  }
*/
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
      dt[xmlns] = this.ns[xmlns];
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

StateVar.prototype.pushValueListJXML = function(where) {

  // not allowed with extended type attribute
  if (where._content.dataType._attrs &&
    where._content.dataType._attrs.type) return;

  if (this.valueList && this.valueList.length) {
    var allowedValueList = [];
    where._content.allowedValueList = allowedValueList;

    this.valueList.forEach(function(v) {
      allowedValueList.push({
        _name : "allowedValue",
        _content : v
      });
    });
  }
}

StateVar.prototype.pushRangeJXML = function(where) {
  // not allowed with extended type attribute
  if (where._content.dataType._attrs &&
    where._content.dataType._attrs.type) return;

  if (this.range && this.range.minimum && this.range.maximum) {
    where._content.allowedValueRange = this.range;
    }
}



StateVar.prototype.outOfRange = function(value){
  if (this.range){
    if (this.range.minimum && value < this.range.minimum){
      return true;
    }
    if (this.range.maximum && value > this.range.maximum){
      return true;
    }
  }
  return false;
}

StateVar.prototype.notInAllowedList = function(value){
  if (this.valueList.length && (this.valueList.indexOf(value) < 0)){
    return true;
  }
  return false;
}

StateVar.prototype.validate = function(value, callback){

  var res = null;

  switch (this.type){
    case "boolean":
      res = (value === "yes" || value === "true" || value === "1" || value) ? 1 : 0;
      break;
    case "ui1":
    case "ui2":
    case "ui4":
    case "i1":
    case "i2":
    case "i4":
    case "int":
      res = parseInt(value);
      if (this.outOfRange(res)){
          return callback(601, "Out of range value '"+res+"' for :"+this.name);
      }
      break;
    case "r4":
    case "r8":
    case "number":
    case "fixed.14.4":
    case "float":
      res = parseFloat(value);
      if (this.outOfRange(res)){
          return callback(601, "Out of range value '"+res+"' for :"+this.name);
      }
      break;
    default:
      res = value;
      if (this.notInAllowedList(res)){
        return callback(this.errCode, "invalid value '"+res+"' for :"+this.name);
      }
  }

  callback(null, null, res);
}

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
 *  Lastchange event model
 *  Handle as per service basis
 */
StateVar.prototype.lastChange = function(){

   this.service.lastChange(this);

}
