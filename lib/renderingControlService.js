/*jslint node: true, sub:true */
"use strict";

var Util = require('util');
var path = require('path');
var http = require('http');
var jstoxml = require('jstoxml');
var xmldoc = require('./util/xmldoc');
var Service = require("./service");
var Xmlns = require('./xmlns');
var debug = require('debug')('service:renderingControl');

var  RenderingControlService = function(device, classPrefix, configuration) {


  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:RenderingControl",
    serviceId : "urn:upnp-org:serviceId:RenderingControl",
    route: "rcs"
  }, configuration);

  var self = this;

  // AVT 1.x spec
  this.addAction('SetVolume', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    },{
        name:"Channel",
        type:"A_ARG_TYPE_Channel"
    },{
      name:'DesiredVolume',
      type:'Volume'
    }],[]);
  this.addAction('GetVolume', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    },{
        name:"Channel",
        type:"A_ARG_TYPE_Channel"
    }],[{
      name:'CurrentVolume',
      type:'Volume'
    }]);
  this.addAction('GetMute', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    },{
      name:"Channel",
      type:"A_ARG_TYPE_Channel"
    }],[{
      name:'CurrentMute',
      type:'Mute'
    }]);
  this.addAction('SetMute', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    },{
        name:"Channel",
        type:"A_ARG_TYPE_Channel"
    },{
      name:'DesiredMute',
      type:'Mute'
    }],[]);
  this.addAction('ListPresets', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    }],[{
      name:'CurrentPresetNameList',
      type:'PresetNameList'
    }]);
  this.addAction('SelectPreset', [{
      name:"InstanceID",
      type:"A_ARG_TYPE_InstanceID"
    },{
      name:'PresetName',
      type:'A_ARG_TYPE_PresetName'
    }],[]);

  this.addType("A_ARG_TYPE_InstanceID", "ui4",716, configuration.InstanceID || 0);
  this.addType("LastChange", "string",600, "", [], {"rcs-event":"urn:schemas-upnp-org:metadata-1-0/RCS"}, true, 0.2);
  this.addType("A_ARG_TYPE_Channel", "string",600, "Master", ["Master"]);
  this.addType("A_ARG_TYPE_PresetName", "string",600, "FactoryDefaults",
      ["FactoryDefaults", "InstallationDefaults"]);
  this.addType("Volume", "ui2",600, 50);
  this.addType("Mute", "boolean",600, 0);
  this.addType("PresetNameList", "string",600, "FactoryDefaults");
  return this;
}

Util.inherits(RenderingControlService, Service);
module.exports =RenderingControlService;

RenderingControlService.prototype.processSoap_SetVolume = function(request,
  callback){
      var self = this;
      var volume   = self.soapVars["DesiredVolume"];
      var channel  = self.soapVars["Channel"];


      if (!volume) {
        callback(402, "SetVolume without volume");
        return
      }

      // playlist url or single item
      this.emit("volume", volume, function(){
          self.stateVars["Volume"].set(volume);
          callback();
      }.bind(this));

}
RenderingControlService.prototype.processSoap_SetMute = function(request,
    callback){
      var self = this;
      var mute     = self.soapVars["DesiredMute"];
      var channel  = self.soapVars["Channel"];

      if (mute == undefined) {
        callback(402, "SetMute without mute");
        return
      }

      // playlist url or single item

      this.emit("mute", mute, function(){
        self.stateVars["Mute"].set(mute);
          callback();
      }.bind(this));

}
RenderingControlService.prototype.lastChange = function(stateVar){

  var InstanceID = self.stateVars["A_ARG_TYPE_InstanceID"].get();
  // find instance 0 and use the LastChange var on this instance
  var route = self.route;
  var index = route.indexOf(InstanceID);
  if (index > -1) {
    route = route.substr(0, index-1);
  }
  var LastChange = self.device.services[route].stateVars["LastChange"];
  var lastJXML = LastChange.get();
  if (!lastJXML){
    lastJXML = {
     _name:"Event",
     _content : []
   };
  }

  // console.log(Util.inspect(lastJXML, {depth:5}));

  var _content = lastJXML._content;
  // find if there is an event prop set for this instance
  var instance;
  var len = _content.length;
  for (var i = 0; i < len; i++){
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
    _content.push(newinstance);
  }
  // update value of prop if there is an event prop allready set
  var found = false;
  var len = instance.length;
  for (var i=0; i < len; i++){
    if (instance[i].name == stateVar.name){
      found = true;
      instance[i]._attrs["val"] = stateVar.value;
      break;
    }
  }
  if (!found){
    instance.push({
      _name : stateVar.name,
      _attrs : {val: stateVar.value},
    })
  }

  LastChange.set(lastJXML);
}
