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

var  SonosZoneGroupTopology = function(device, classPrefix, configuration) {

  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:ZoneGroupTopology",
    serviceId : "urn:upnp-org:serviceId:ZoneGroupTopology",
    route: "zg"
  }, configuration);

  var self = this;

  this.addAction("CheckForUpdate", 
		 [ { name: "UpdateType", type: "A_ARG_TYPE_UpdateType"},
		   { name: "CachedOnly", type: "A_ARG_TYPE_CachedOnly"},
		   { name: "Version", type: "A_ARG_TYPE_Version"} ],
		 [ { name: "UpdateItem", type: "A_ARG_TYPE_UpdateItem"} ]);
  this.addAction("BeginSoftwareUpdate", 
		 [ { name: "UpdateURL", type: "A_ARG_TYPE_UpdateURL"},
		   { name: "Flags", type: "A_ARG_TYPE_UpdateFlags"},
		   { name: "ExtraOptions", type: "A_ARG_TYPE_UpdateExtraOptions"} ],
		 []);
  this.addAction("ReportUnresponsiveDevice", 
		 [ { name: "DeviceUUID", type: "A_ARG_TYPE_MemberID"},
		   { name: "DesiredAction", type: "A_ARG_TYPE_UnresponsiveDeviceActionType"} ],
		 []);
  this.addAction("ReportAlarmStartedRunning", [], []);
  this.addAction("SubmitDiagnostics", 
		 [ { name: "DiagnosticID", type: "DiagnosticID"},
		   { name: "IncludeControllers", type: "A_ARG_TYPE_IncludeControllers"},
		   { name: "Type", type: "A_ARG_TYPE_Origin"} ],
		 []);
  this.addAction("RegisterMobileDevice", 
		 [ { name: "MobileDeviceName", type: "A_ARG_TYPE_MobileDeviceName"},
		   { name: "MobileDeviceUDN", type: "A_ARG_TYPE_MobileDeviceUDN"},
		   { name: "MobileIPAndPort", type: "A_ARG_TYPE_MobileIPAndPort"} ],
		 []);
  this.addAction("GetZoneGroupAttributes", 
		 [ { name: "CurrentZoneGroupName", type: "ZoneGroupName"},
		   { name: "CurrentZoneGroupID", type: "ZoneGroupID"},
		   { name: "CurrentZonePlayerUUIDsInGroup", type: "ZonePlayerUUIDsInGroup"} ],
		 []);
  this.addAction("GetZoneGroupState", 
		 [],
		 [ { name: "ZoneGroupState", type: "ZoneGroupState"} ]);

  this.addType("AvailableSoftwareUpdate", "string", "", [] ,"", true);
  this.addType("ZoneGroupState", "string", "", [], "", true);
  this.addType("ThirdPartyMediaServersX", "string", "", [], "", true);
  this.addType("AlarmRunSequence", "string", "", [], "", true);
  this.addType("ZoneGroupName", "string", "", [], "", true);
  this.addType("ZoneGroupID", "string", "", [], "", true);
  this.addType("ZoneGroupStateUUIDsInGroup", "string", "", [], "", true);
  this.addType("A_ARG_TYPE_UpdateType", "string", "", ["All", "Software"]);
  this.addType("A_ARG_TYPE_CachedOnly", "boolean", false);
  this.addType("A_ARG_TYPE_UpdateItem", "string", "");
  this.addType("A_ARG_TYPE_UpdateURL", "string", "");
  this.addType("A_ARG_TYPE_UpdateFlags", "ui4", 0);
  this.addType("A_ARG_TYPE_UpdateExtraOptions", "string", "");
  this.addType("A_ARG_TYPE_Version", "string", "");
  this.addType("A_ARG_TYPE_MemberID", "string", "");
  this.addType("A_ARG_TYPE_UnresponsiveDeviceActionType", "string", "", ["Remove", "VerifyThenRemoveSystemWide"]);
  this.addType("DiagnosticID", "ui4", 0);
  this.addType("A_ARG_TYPE_IncludeControllers", "boolean", false);
  this.addType("A_ARG_TYPE_Origin", "string", "");
  this.addType("A_ARG_TYPE_MobileDeviceName", "string", "");
  this.addType("A_ARG_TYPE_MobileDeviceUDN", "string", "");
  this.addType("A_ARG_TYPE_MobileDeviceIPAndPort", "string", "");

  return this;
}

Util.inherits(SonosZoneGroupTopology, Service);
module.exports = SonosZoneGroupTopology;

