/*jslint node: true, sub:true, esversion: 6 */
"use strict";

var Util = require('util');

var Service = require("./service");

class ConnectionManagerService extends Service {
  constructor() {
    super({
      serviceType : "urn:schemas-upnp-org:service:ConnectionManager:1",
      serviceId : "urn:upnp-org:serviceId:ConnectionManager",
      route : "cms"
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
    
    // addType (name, type, value, valueList, ns, evented,
    // moderation_rate, additionalProps, preEventCb, postEventCb)
    this.addType("A_ARG_TYPE_ProtocolInfo", "string");
    
    this.addType("A_ARG_TYPE_ConnectionStatus", "string", "Unknown", 
        [ "OK", "ContentFormatMismatch", "InsufficientBandwidth", "UnreliableChannel", "Unknown" ]);
    this.addType("A_ARG_TYPE_AVTransportID", "i4");
    this.addType("A_ARG_TYPE_RcsID", "i4");
    this.addType("A_ARG_TYPE_ConnectionID", "i4");
    this.addType("A_ARG_TYPE_ConnectionManager", "string");
    this.addType("SourceProtocolInfo", "string", "", [], null, true);
    this.addType("SinkProtocolInfo", "string", "", [], null, true);
    this.addType("A_ARG_TYPE_Direction", "string", "Output", [ "Input", "Output" ]);
    this.addType("CurrentConnectionIDs", "string");
  }

  initialize(upnpServer, callback) {
    // Kept here for intel upnp toolkit, but not in upnp spec
    super.initialize(upnpServer, () => {
      if (upnpServer.configuration.enableIntelToolkitSupport) {
        this._intervalTimer = setInterval(() => {
          this._sendPropertyChangesEvent();
        }, 1500);
      }
      return callback(null, this);
    });
  }

//Kept here for intel upnp toolkit, but not in upnp spec
  _sendPropertyChangesEvent() {

    var stateVars = this.stateVars;

    var xmlContent = [];
    stateVars["CurrentConnectionIDs"].pushEventJXML(xmlContent);
    stateVars["SinkProtocolInfo"].pushEventJXML(xmlContent);
    stateVars["SourceProtocolInfo"].pushEventJXML(xmlContent);

    this.makeEvent(xmlContent);
  }
}

module.exports = ConnectionManagerService;

