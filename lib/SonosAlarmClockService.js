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

var  SonosAlarmClock = function(device, classPrefix, configuration) {

  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:AlarmClock",
    serviceId : "urn:upnp-org:serviceId:AlarmClock",
    route: "ac"
  }, configuration);

  var self = this;

  this.addAction("SetFormat", 
		 [ { name: "DesiredTimeFormat", type: "TimeFormat"},
		   { name: "DesiredDateFormat", type: "DateFormat"} ],
		 []);
  this.addAction("GetFormat", 
		 [],
		 [ { name: "CurrentTimeFormat", type: "TimeFormat"},
		   { name: "CurrentDateFormat", type: "DateFormat"} ]);
  this.addAction("SetTimeZone", 
		 [ { name: "Index", type: "A_ARG_TYPE_TimeZoneIndex"},
		   { name: "AutoAdjustDst", type: "A_ARG_TYPE_TimeZoneAutoAdjustDst"} ],
		 []);
  this.addAction("GetTimeZone", 
		 [],
		 [ { name: "Index", type: "A_ARG_TYPE_TimeZoneIndex"},
		   { name: "AutoAdjustDst", type: "A_ARG_TYPE_TimeZoneAutoAdjustDst"} ] );
  this.addAction("GetTimeZoneAndRule", 
		 [],
		 [ { name: "Index", type: "A_ARG_TYPE_TimeZoneIndex"},
		   { name: "AutoAdjustDst", type: "A_ARG_TYPE_TimeZoneAutoAdjustDst"},
		   { name: "CurrentTimeZone", type: "TimeZone"} ] );
  this.addAction("GetTimeZoneRule", 
		 [ { name: "Index", type: "A_ARG_TYPE_TimeZoneIndex"} ],
		 [ { name: "TimeZone", type: "TimeZone"} ] );
  this.addAction("SetTimeServer", 
		 [ { name: "DesiredTimeServer", type: "TimeServer"} ],
		 []);
  this.addAction("GetTimeServer", 
		 [],
		 [ { name: "CurrentTimeServer", type: "TimeServer"} ] );
  this.addAction("SetTimeNow", 
		 [ { name: "DesiredTime", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "TimeZoneForDesiredTime", type: "A_ARG_TYPE_TimeZoneInformation"} ],
		 []);
  this.addAction("GetHouseholdTimeAtStamp", 
		 [],
		 [ { name: "TimeStamp", type: "A_ARG_TYPE_TimeStamp"},
		   { name: "HouseholdUTCTime", type: "A_ARG_TYPE_ISO8601Time"} ] );
  this.addAction("GeTimeNow", 
		 [],
		 [ { name: "CurrentUTCTime", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "CurrentLocalTime", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "CurrentTimeZone", type: "TimeZone"},
		   { name: "CurrentTimeGeneration", type: "TimeGeneration"} ]);
  this.addAction("CreateAlarm", 
		 [ { name: "StartLocalTime", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "Duration", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "Recurrence", type: "A_ARG_TYPE_Recurrence"},
		   { name: "Enabled", type: "A_ARG_TYPE_AlarmEnabled"},
		   { name: "RoomUUID", type: "A_ARG_TYPE_AlarmRoomUUID"},
		   { name: "ProgramURI", type: "A_ARG_TYPE_AlarmProgramURI"},
		   { name: "ProgramMetaData", type: "A_ARG_TYPE_AlarmProgramMetaData"},
		   { name: "PlayMode", type: "A_ARG_TYPE_AlarmPlayMode"},
		   { name: "Volume", type: "A_ARG_TYPE_AlarmVolume"},
		   { name: "IncludeLinkedZones", type: "A_ARG_TYPE_AlarmIncludeLinkedZones"} ],
		 [ { name: "AssignedID", type: "A_ARG_TYPE_AlarmID"} ]);
  this.addAction("UpdateAlarm", 
		 [ { name: "ID", type: "A_ARG_TYPE_AlarmID"},
		   { name: "StartLocalTime", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "Duration", type: "A_ARG_TYPE_ISO8601Time"},
		   { name: "Recurrence", type: "A_ARG_TYPE_Recurrence"},
		   { name: "Enabled", type: "A_ARG_TYPE_AlarmEnabled"},
		   { name: "RoomUUID", type: "A_ARG_TYPE_AlarmRoomUUID"},
		   { name: "ProgramURI", type: "A_ARG_TYPE_AlarmProgramURI"},
		   { name: "ProgramMetaData", type: "A_ARG_TYPE_AlarmProgramMetaData"},
		   { name: "PlayMode", type: "A_ARG_TYPE_AlarmPlayMode"},
		   { name: "Volume", type: "A_ARG_TYPE_AlarmVolume"},
		   { name: "IncludeLinkedZones", type: "A_ARG_TYPE_AlarmIncludeLinkedZones"} ],
		 []);
  this.addAction("DestroyAlarm", 
		 [ { name: "ID", type: "A_ARG_TYPE_AlarmID"} ],
		 []);
  this.addAction("ListAlarms", 
		 [],
		 [ { name: "CurrentAlarmList", type: "A_ARG_TYPE_AlarmList"},
		   { name: "CurrentAlarmListVersion", type: "AlarmListVersion"} ]);
  this.addAction("SetDailyIndexRefreshTime", 
		 [ { name: "DesiredDailyIndexRefreshTime", type: "DailyIndexRefreshTime"} ],
		 []);
  this.addAction("GetDailyIndexRefreshTime", 
		 [],
		 [ { name: "CurrntDailyIndexRefreshTime", type: "DailyIndexRefreshTime"} ] );

  this.addType("A_ARG_TYPE_ISO8601Time", "string", "");
  this.addType("A_ARG_TYPE_Recurrence", "string", "", 
	       ["ONCE", "WEEKDAYS", "WEEKENDS", "DAILY"] );
  this.addType("A_ARG_TYPE_AlarmID", "string", "");
  this.addType("A_ARG_TYPE_AlarmList", "string", "");
  this.addType("A_ARG_TYPE_AlarmEnabled", "boolean", false);
  this.addType("A_ARG_TYPE_AlarmProgramURI", "string", "");
  this.addType("A_ARG_TYPE_AlarmProgramMetaData", "string", "");
  this.addType("A_ARG_TYPE_AlarmPlayMode", "string", "NORMAL",
	      ["NORMAL", "REPEAT_ALL", "SHUFFLE_NOREPEAT", "SHUFFLE"]);
  this.addType("A_ARG_TYPE_AlarmVolume", "ui2", 0);
  this.addType("A_ARG_TYPE_AlarmIncludeLinkedZones", "boolean", false);
  this.addType("A_ARG_TYPE_AlarmRoomUUID", "string", "");
  this.addType("A_ARG_TYPE_TimeZoneIndex", "i4", 0);
  this.addType("A_ARG_TYPE_TimeZoneAutoAdjustDst", "boolean", false);
  this.addType("A_ARG_TYPE_TimeZoneInformation", "string", "");
  this.addType("A_ARG_TYPE_TimeStamp", "string", "");
  this.addType("TimeZone", "string", "", [], "", true);
  this.addType("TimeServer", "string", "", [], "", true);
  this.addType("TimeGeneration", "ui4", 0, [], "", true);
  this.addType("AlarmListVersion", "string", "", [], "", true);
  this.addType("DailyIndexRefreshTime", "string", "", [], "", true);
  this.addType("TimeFormat", "string", "", [], "", true);
  this.addType("DateFormat", "string", "", [], "", true);

  return this;
}

Util.inherits(SonosAlarmClock, Service);
module.exports = SonosAlarmClock;

