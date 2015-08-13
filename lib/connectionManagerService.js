/*jslint node: true */
"use strict";

var Util = require('util');

var Service = require("./service");

var ConnectionManagerService = function() {
  Service.call(this, {
    serviceType : "urn:schemas-upnp-org:service:ConnectionManager:1",
    serviceId : "urn:upnp-org:serviceId:ConnectionManager",
    scpdURL : "/cms.xml",
    controlURL : "/cms/control",
    eventSubURL : "/cms/event"
  });

  this.addAction("GetCurrentConnectionIDs", [], [ {
    name : "ConnectionIDs",
    type : "CurrentConnectionIDs"
  } ]);
  this.addAction("GetCurrentConnectionInfo", [ {
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
  this.addAction("GetProtocolInfo", [], [ {
    name : "Source",
    type : "SourceProtocolInfo"
  }, {
    name : "Sink",
    type : "SinkProtocolInfo"
  } ]);

  this.addType("A_ARG_TYPE_ProtocolInfo", false, "string");
  this.addType("A_ARG_TYPE_ConnectionStatus", false, "string", [ "OK",
      "ContentFormatMismatch", "InsufficientBandwidth", "UnreliableChannel",
      "Unknown" ]);
  this.addType("A_ARG_TYPE_AVTransportID", false, "i4");
  this.addType("A_ARG_TYPE_RcsID", false, "i4");
  this.addType("A_ARG_TYPE_ConnectionID", false, "i4");
  this.addType("A_ARG_TYPE_ConnectionManager", false, "string");
  this.addType("SourceProtocolInfo", true, "string");
  this.addType("SinkProtocolInfo", true, "string");
  this.addType("A_ARG_TYPE_Direction", false, "string", [ "Input", "Output" ]);
  this.addType("CurrentConnectionIDs", true, "string");

  this.currentConnectionIDs = "";
  this.sinkProtocolInfo = "";
  this.sourceProtocolInfo = "";

  var self = this;
  this._intervalTimer = setInterval(function() {
    self._sendPropertyChangesEvent();
  }, 1500);
};

Util.inherits(ConnectionManagerService, Service);

module.exports = ConnectionManagerService;

ConnectionManagerService.prototype._sendPropertyChangesEvent = function() {

  var props = {
    "s:CurrentConnectionIDs" : this.currentConnectionIDs,
    "s:SinkProtocolInfo" : this.sinkProtocolInfo,
    "s:SourceProtocolInfo" : this.sourceProtocolInfo
  };

  var xmlContent = [];

  for ( var key in props) {
    xmlContent.push({
      _name : "e:property",
      _content : {
        _name : key,
        _attrs : {
          "dt:dt" : "string"
        },
        _content : props[key]
      }
    });
  }

  xmlContent = {
    _name : "e:propertyset",
    _attrs : {
      xmlns : Service.UPNP_SERVICE_XMLNS,
      "xmlns:e" : Service.UPNP_EVENT_XMLNS,
      "xmlns:dt" : Service.MICROSOFT_DATATYPES_XMLNS,
      "xmlns:s" : this.type
    },
    _content : xmlContent
  };

  this.sendEvent("upnp:propchange", xmlContent);
};
