/*jslint node: true, sub:true */
"use strict";

var Util = require('util');
var path = require('path');
var http = require('http');
var jstoxml = require('jstoxml');
var xmldoc = require('./util/xmldoc');
var Service = require("./service");
var Xmlns = require('./xmlns');
var debug = require('debug')('service:sonosdeviceprops');

var  SonosDeviceProperties = function(device, classPrefix, configuration) {

  // NOTE: stateVars:evented in multiple instances context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:DeviceProperties",
    serviceId : "urn:upnp-org:serviceId:DeviceProperties",
    route: "dp"
  }, configuration);

  var self = this;

  this.addAction('SetLEDState', [{ name:"DesiredLEDState", type:"LEDState" }],[]);
  this.addAction('GetLEDState', [],[{ name:"CurrentLEDState", type:"LEDState" }]);
  this.addAction('SetInvisible', [{ name:"DesiredInvisible", type:"Invisible" }],[]);
  this.addAction('GetInvisible', [], [{ name:"CurrentInvisible", type:"Invisible" }]);
  this.addAction('AddBondedZones',[{ name: "ChannelMapSet", type:"ChannelMapSet"}],[]);
  this.addAction('RemoveBondedZones',[{ name: "ChannelMapSet", type:"ChannelMapSet"}],[]);
  this.addAction('CreateStereoPair',[{ name: "ChannelMapSet", type:"ChannelMapSet"}],[]);
  this.addAction('SeparateStereoPair',[{ name: "ChannelMapSet", type:"ChannelMapSet"}],[]);
  this.addAction('SetZoneAttributes',[
      { name: "DesiredZoneName", type: "ZoneName"},
      { name: "DesiredIcon", type: "Icon"},
      { name: "DesiredConfiguration", type: "Configuration"}
    ],[]);
  this.addAction('GetZoneAttributes',[], [
      { name: "CurrentZoneName", type: "ZoneName" },
      { name: "CurrentIcon", type: "Icon" },
      { name: "CurrentConfiguration", type: "Configuration" }
    ]);
  this.addAction('GetHouseholdID',[], [ { name: "CurrentHouseholdID", type: "HouseholdID" } ]);
  this.addAction('GetZoneInfo',[], [
      { name: "SerialNumber", type: "SerialNumber" },
      { name: "SoftwareVersion", type: "SoftwareVersion" },
      { name: "DisplaySoftwareVersion", type: "DisplaySoftwareVersion" },
      { name: "HardwareVersion", type: "HardwareVersion" },
      { name: "IPAddress",  type: "IPAddress"},
      { name: "MACAddress",  type: "MACAddress"},
      { name: "CopyrightInfo",  type: "CopyrightInfo"},
      { name: "ExtraInfo",  type: "ExtraInfo"},
      { name: "HTAudioIn",  type: "HTAudioIn"},
    ]);
   this.addAction('SetAutoplayLinkedZones',[ { name: "IncludeLinkedZones", type: "AutoplayIncludeLinkedZones" } ],[]);
   this.addAction('GetAutoplayLinkedZones',[], [{ name: "IncludeLinkedZones", type: "AutoplayIncludeLinkedZones" }]);
   this.addAction('SetAutoplayRoomUUID',[ { name: "RoomUUID", type: "AutoplayRoomUUID" } ],[]);
   this.addAction('GetAutoplayRoomUUID',[], [ { name: "RoomUUID", type: "AutoplayRoomUUID" } ]);
   this.addAction('SetAutoplayVolume',[ { name: "Volume", type: "AutoplayVolume" } ],[]);
   this.addAction('GetAutoplayVolume',[], [ { name: "Volume", type: "AutoplayVolume" } ]);
   this.addAction('ImportSetting',[
      { name: "SettingID", type: "A_ARG_TYPE_SettingID" },
      { name: "SettingURI", type: "A_ARG_TYPE_SettingURI" },
       ], []);
   this.addAction('SetUseAutoplayVolume',[ { name: "UseVolume", type: "AutoplayUseVolume" } ],[]);
   this.addAction('GetUseAutoplayVolume',[], [ { name: "UseVolume", type: "AutoplayUseVolume" } ]);
   this.addAction('AddHTSatellite',[ { name: "HTSatChanMapSet", type: "HTSatChanMapSet" } ],[]);
   this.addAction('RemoveHTSatellite',[ { name: "SatRoomUUID", type: "SatRoomUUID" } ],[]);

  // NOTE: 600 is "invalid value" soap error code used by default
  this.addType("LEDState", "string", 600, "", ["On","Off"])
  this.addType("Invisible", "boolean", 600, 0, [], "", true );
  this.addType("ChannelMapSet", "string", 600, "", [], "", true );
  this.addType("ZoneName", "string", 600, "", [], "", true );
  this.addType("Icon", "string", 600, "", [], "", true );
  this.addType("Configuration", "string", 600, "", [], "", true );
  this.addType("HouseholdID", "string", 600, "");

  this.addType("SerialNumber", "string", 600, "");
  this.addType("SoftwareVersion", "string", 600, "");
  this.addType("DisplaySoftwareVersion", "string", 600, "");
  this.addType("HardwareVersion", "string", 600, "");
  this.addType("IPAddress", "string", 600, "");
  this.addType("MACAddress", "string", 600, "");
  this.addType("CopyrightInfo", "string", 600, "");
  this.addType("ExtraInfo", "string", 600, "");
  this.addType("HTAudioIn", "ui4", 600, 0);

  this.addType("AutoplayIncludeLinkedZones", "boolean", 600, false);
  this.addType("AutoplayRoomUUID", "string", 600, "");
  this.addType("AutoplayVolume", "ui2", 600, 50, {minimum:0, maximum:100, step:1});      // Need to fix for value range
  this.addType("A_ARG_TYPE_SettingID", "ui4", 600, 0,{minimum:-1e16, maximum:1e32}); // need to fix value range
  this.addType("A_ARG_TYPE_SettingURI", "string", 600, "");
  this.addType("AutoplayUseVolume", "boolean", 600, false);
  this.addType("HTSatChanMapSet", "string", 600, "", [], "", true );
  this.addType("SatRoomUUID", "string", 600, "");

  this.addType("SettingsReplicationState", "string", 600, "", [], "", true );
  this.addType("IsZoneBridge", "boolean", "false", 600, [], "", true );
  this.addType("HTFreq", "ui4", 600, "", [], "", true );

  return this;
}

Util.inherits(SonosDeviceProperties, Service);
module.exports =SonosDeviceProperties;
