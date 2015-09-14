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

  // NOTE: stateVars:evented in instance context define whenever the var is
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

  
  this.addType("LEDState", "string", "", ["On","Off"])
  this.addType("Invisible", "boolean", 0, [], "", true );    
  this.addType("ChannelMapSet", "string", "", [], "", true );
  this.addType("ZoneName", "string", "", [], "", true );
  this.addType("Icon", "string", "", [], "", true );
  this.addType("Configuration", "string", "", [], "", true );
  this.addType("HouseholdID", "string", "");
  
  this.addType("SerialNumber", "string", "");
  this.addType("SoftwareVersion", "string", "");
  this.addType("DisplaySoftwareVersion", "string", "");
  this.addType("HardwareVersion", "string", "");
  this.addType("IPAddress", "string", "");
  this.addType("MACAddress", "string", "");
  this.addType("CopyrightInfo", "string", "");
  this.addType("ExtraInfo", "string", "");
  this.addType("HTAudioIn", "ui4", 0);
  
  this.addType("AutoplayIncludeLinkedZones", "boolean", false);
  this.addType("AutoplayRoomUUID", "string", "");
  this.addType("AutoplayVolume", "ui2", 50);      // Need to fix for value range
  this.addType("A_ARG_TYPE_SettingID", "ui4", 0); // need to fix value range
  this.addType("A_ARG_TYPE_SettingURI", "string", ""); 
  this.addType("AutoplayUseVolume", "boolean", false);
  this.addType("HTSatChanMapSet", "string", "", [], "", true );
  this.addType("SatRoomUUID", "string", "");
  
  this.addType("SettingsReplicationState", "string", "", [], "", true );
  this.addType("IsZoneBridge", "boolean", "false", [], "", true );
  this.addType("HTFreq", "ui4", "", [], "", true );
  
  return this;
}

Util.inherits(SonosDeviceProperties, Service);
module.exports =SonosDeviceProperties;

