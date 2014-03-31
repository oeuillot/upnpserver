/*jslint node: true */
"use strict";

var Service = require("./service");

var connectionManagerService = new Service({
    serviceType : "urn:schemas-upnp-org:service:ConnectionManager:1",
    serviceId : "urn:upnp-org:serviceId:ConnectionManager",
    scpdURL : "/cms.xml",
    controlURL : "/cms/control",
    eventSubURL : "/cms/event"
});

module.exports = connectionManagerService;

connectionManagerService.addAction("GetCurrentConnectionIDs", [], [ {
    name : "ConnectionIDs",
    type : "CurrentConnectionIDs"
} ]);
connectionManagerService.addAction("GetCurrentConnectionInfo", [ {
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
connectionManagerService.addAction("GetProtocolInfo", [], [ {
    name : "Source",
    type : "SourceProtocolInfo"
}, {
    name : "Sink",
    type : "SinkProtocolInfo"
} ]);

connectionManagerService.addType("A_ARG_TYPE_ProtocolInfo", false, "string");
connectionManagerService.addType("A_ARG_TYPE_ConnectionStatus", false,
	"string", [ "OK", "ContentFormatMismatch", "InsufficientBandwidth",
		"UnreliableChannel", "Unknown" ]);
connectionManagerService.addType("A_ARG_TYPE_AVTransportID", false, "i4");
connectionManagerService.addType("A_ARG_TYPE_RcsID", false, "i4");
connectionManagerService.addType("A_ARG_TYPE_ConnectionID", false, "i4");
connectionManagerService.addType("A_ARG_TYPE_ConnectionManager", false,
	"string");
connectionManagerService.addType("SourceProtocolInfo", true, "string");
connectionManagerService.addType("SinkProtocolInfo", true, "string");
connectionManagerService.addType("A_ARG_TYPE_Direction", false, "string", [
	"Input", "Output" ]);
connectionManagerService.addType("CurrentConnectionIDs", true, "string");
