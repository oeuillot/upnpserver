/*jslint node: true, sub: true */
"use strict";

var Util = require('util');
var debug = require('debug')('upnpserver:mediaReceiverRegistrarService');

var Service = require("./service");
var Xmlns = require('./xmlns');

var MediaReceiverRegistrar = function(device, classPrefix, configuration) {
  Service.call(this, device, classPrefix, {
    serviceType : "urn:microsoft.com:service:X_MS_MediaReceiverRegistrar",
    serviceId : "urn:microsoft.com:serviceId:X_MS_MediaReceiverRegistrar",
    route: "mrr"
  }, configuration);

  this.addAction("IsAuthorized", [ {
    name : "DeviceID",
    type : "A_ARG_TYPE_DeviceID"
  } ], [ {
    name : "Result",
    type : "A_ARG_TYPE_Result"
  } ]);
  this.addAction("IsValidated", [ {
    name : "DeviceID",
    type : "A_ARG_TYPE_DeviceID"
  } ], [ {
    name : "Result",
    type : "A_ARG_TYPE_Result"
  } ]);
  this.addAction("RegisterDevice", [ {
    name : "RegistrationReqMsg",
    type : "A_ARG_TYPE_RegistrationReqMsg"
  } ], [ {
    name : "RegistrationRespMsg",
    type : "A_ARG_TYPE_RegistrationRespMsg"
  } ]);

  this.addType("A_ARG_TYPE_DeviceID", "string");
  this.addType("A_ARG_TYPE_RegistrationReqMsg", "bin.base64");
  this.addType("A_ARG_TYPE_RegistrationRespMsg", "bin.base64");
  this.addType("A_ARG_TYPE_Result", "int", 1);
  this.addType("AuthorizationDeniedUpdateID", "ui4", 1, [], {
    "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
    "dt:dt" : "int"
  }, true);
  this.addType("AuthorizationGrantedUpdateID", "ui4", 1, [], {
    "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
    "dt:dt" : "int"
  }, true);
  this.addType("ValidationRevokedUpdateID", "ui4", 1, [], {
    "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
    "dt:dt" : "int"
  }, true);
  this.addType("ValidationSucceededUpdateID", "ui4", 1, [], {
    "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
    "dt:dt" : "int"
  }, true);

};

Util.inherits(MediaReceiverRegistrar, Service);

module.exports = MediaReceiverRegistrar;

MediaReceiverRegistrar.prototype.processSoap_RegisterDevice = function(xml,
    request, callback) {

  return callback();
};

MediaReceiverRegistrar.prototype.processSoap_IsAuthorized = function(xml,
  request,  callback) {

  var self = this;

  var deviceID = this.soapArgs["DeviceID"];
  this.soapArgs["Result"] = 1;

  debug("IsAuthorized('" + deviceID + "')");

  callback(null);
};

MediaReceiverRegistrar.prototype.processSoap_IsValidated = function(xml,
    request, callback) {

  var self = this;

  var deviceID = this.soapArgs["DeviceID"];
  this.soapArgs["Result"] = 1;

  debug("IsValidated('" + deviceID + "')");

  callback(null);
};
