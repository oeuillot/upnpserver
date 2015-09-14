/*jslint node: true, sub:true */
"use strict";

var Util = require('util');
var Service = require("./service");

// NOTE: the service class name and filename must end with Service
var YourService = function(device, classPrefix, configuration) {

  // TODO: adjust service type and id,
  // setup a unique route for this service (shortname for this service)
  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:YourService",
    serviceId : "urn:upnp-org:serviceId:YourService",
    route: "cms"
  }, configuration);

  // TODO: declare actions with input / output name and type
  this.addAction("GetCurrentConnectionIDs", [], [ {
    name : "ConnectionIDs",
    type : "CurrentConnectionIDs"
  } ]);

  // TODO:
  // see: stateVars and Service for details.
  // addType (name, type, soapErrorCode, value, valueList, xmlns, evented,
  // moderation_rate, additionalProps, preEventCb, postEventCb)
  this.addType("A_ARG_TYPE_ProtocolInfo", "string", 701);
  this.addType("A_ARG_TYPE_ConnectionStatus", "string", 600, "Unknown", [ "OK",
      "ContentFormatMismatch", "InsufficientBandwidth", "UnreliableChannel",
      "Unknown" ]);

};

Util.inherits(YourService, Service);

module.exports = YourService;

YourService.prototype.initialize = function(callback) {
  var self = this;
  callback(null, self);
};

// TODO: implements soap actions handlers requiring processing
// NOTE: state variable get without processing needed are handled automagically
YourService.prototype.processSoap_MyActionName = function(xml, request,
  callback){

    // 1 : retrieve action in parms in soapVars
    // NOTE: soapVars are readOnce, they reset to null on read
    // type validation and numbers parsing is allready done.
    var MySoapInVarNameValue  = this.soapVars["MySoapInVarName"];

    // 2: get / set action state variables according specs
    // NOTE: stateVars may be evented. if you set() your event may fire.
    // if you want to set without firing event use the .value property
    this.stateVars["TransportState"].get();
    this.stateVars["TransportState"].set('TRANSITIONING');

    // 3: do your stuff

    // 4: push action out params in soapVars
    this.soapVars["MySoapOutVarName"] = MySoapOutVarNameValue;

    // 5: callback to send resonse at end or at any time on error
    // NOTE: use null to send response
    // use a soap error code and a user friendly error message on failed
    callback(null); // to Send
    callback(404, "this action has failed, reason: "); // to respond with error
}
