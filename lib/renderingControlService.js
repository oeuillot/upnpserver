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

var  RenderingControlService = function(configuration) {


  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, {
    serviceType : "urn:schemas-upnp-org:service:RenderingControl",
    serviceId : "urn:upnp-org:serviceId:RenderingControl",
    lastChangeXmlns : {
      "xmlns:avt-event":"urn:schemas-upnp-org:metadata-1-0/AVT_RCS"
    },
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
      },[]]);

    this.addType("A_ARG_TYPE_InstanceID", "ui4", configuration.InstanceID || 0);
    this.addType("LastChange", "string", "", [], null, true, 0.2);
    this.addType("A_ARG_TYPE_Channel", "string", "Master", ["Master"])
    this.addType("A_ARG_TYPE_PresetName", "string", "FactoryDefaults",
        ["FactoryDefaults"])
    this.addType("Volume", "ui2", 50)
    this.addType("Mute", "boolean", 0)
    this.addType("PresetNameList", "string", "FactoryDefaults")
    return this;
}

Util.inherits(RenderingControlService, Service);
module.exports =RenderingControlService;

RenderingControlService.prototype.processSoap_SetVolume = function(xml, request,
    response, callback){
      var self = this;
      var volume   = self.childValue(xml, "DesiredVolume", Xmlns.UPNP_SERVICE);
      var channel  = self.childValue(xml, "A_ARG_TYPE_Channel", Xmlns.UPNP_SERVICE);


      if (!volume) {
        callback(402, "SetVolume without volume");
        return
      }

      // playlist url or single item
      this.stateVars["Volume"].set(volume);
      this.emit("volume", volume, function(){
          this.processSoap_Get(xml, request, response, callback);
      }.bind(this));

}
RenderingControlService.prototype.processSoap_SetMute = function(xml, request,
    response, callback){
      var self = this;
      var mute     = self.childValue(xml, "DesiredMute", Xmlns.UPNP_SERVICE);
      var channel  = self.childValue(xml, "A_ARG_TYPE_Channel", Xmlns.UPNP_SERVICE);


      if (mute == undefined) {
        callback(402, "SetMute without mute");
        return
      }

      // playlist url or single item
      this.stateVars["Mute"].set(mute);
      this.emit("mute", mute, function(){
          this.processSoap_Get(xml, request, response, callback);
      }.bind(this));

}
