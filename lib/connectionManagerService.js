/*jslint node: true */
"use strict";

var Service = require("./service");

var contentDirectoryService = new Service({
	serviceType : "urn:schemas-upnp-org:service:ConnectionManager:1",
	serviceId : "urn:upnp-org:serviceId:ConnectionManager",
	scpdURL : "/cms.xml",
	controlURL : "/cms/control",
	eventSubURL : "/cms/event"
});

module.exports = contentDirectoryService;

contentDirectoryService.addAction("GetCurrentConnectionIDs", [], [ {
	name : "ConnectionIDs",
	type : "CurrentConnectionIDs"
} ]);
contentDirectoryService.addAction("GetCurrentConnectionInfo", [ {
	name : "ConnectionID",
	type : "A_ARG_TYPE_ConnectionID"
} ], [ {
	name : "RcsID",
	type : "A_ARG_TYPE_RcsID"
}, {
	name : "AVTransportID",
	type : "A_ARG_TYPE_AVTransportID"
}, {
	name : "ProtocolInfo",
	type : "A_ARG_TYPE_ProtocolInfo"
}, {
	name : "PeerConnectionManager",
	type : "A_ARG_TYPE_ConnectionManager"
}, {
	name : "PeerConnectionID",
	type : "A_ARG_TYPE_ConnectionID"
}, {
	name : "Direction",
	type : "A_ARG_TYPE_Direction"
}, {
	name : "Status",
	type : "A_ARG_TYPE_ConnectionStatus"
} ]);
contentDirectoryService.addAction("GetProtocolInfo", [], [ {
	name : "Source",
	type : "SourceProtocolInfo"
}, {
	name : "Sink",
	type : "SinkProtocolInfo"
} ]);

contentDirectoryService.addType("A_ARG_TYPE_ProtocolInfo", false, "string");
contentDirectoryService.addType("A_ARG_TYPE_ConnectionStatus", false, "string",
		[ "OK", "ContentFormatMismatch", "InsufficientBandwidth",
				"UnreliableChannel", "Unknown" ]);
contentDirectoryService.addType("A_ARG_TYPE_AVTransportID", false, "i4");
contentDirectoryService.addType("A_ARG_TYPE_RcsID", false, "i4");
contentDirectoryService.addType("A_ARG_TYPE_ConnectionID", false, "i4");
contentDirectoryService
		.addType("A_ARG_TYPE_ConnectionManager", false, "string");
contentDirectoryService.addType("SourceProtocolInfo", true, "string");
contentDirectoryService.addType("SinkProtocolInfo", true, "string");
contentDirectoryService.addType("A_ARG_TYPE_Direction", false, "string", ["Input", "Output" ]);
contentDirectoryService.addType("CurrentConnectionIDs", true, "string");
