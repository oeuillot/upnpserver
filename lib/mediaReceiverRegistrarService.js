/*jslint node: true, sub: true */
"use strict";

var Util = require('util');
var debug = require('debug')('upnpserver:mediaReceiverRegistrarService');

var Service = require("./service");
var Xmlns = require('./xmlns');

var MediaReceiverRegistrar = function(configuration) {
  Service.call(this, {
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
    dt : Xmlns.MICROSOFT_DATATYPES
  }, true);
  this.addType("AuthorizationGrantedUpdateID", "ui4", 1, [], {
    dt : Xmlns.MICROSOFT_DATATYPES
  }, true);
  this.addType("ValidationRevokedUpdateID", "ui4", 1, [], {
    dt : Xmlns.MICROSOFT_DATATYPES
  }, true);
  this.addType("ValidationSucceededUpdateID", "ui4", 1, [], {
    dt : Xmlns.MICROSOFT_DATATYPES
  }, true);

};

Util.inherits(MediaReceiverRegistrar, Service);

module.exports = MediaReceiverRegistrar;

MediaReceiverRegistrar.prototype.processSoap_RegisterDevice = function(xml,
    request, response, callback) {

  return callback();
};

MediaReceiverRegistrar.prototype.processSoap_IsAuthorized = function(request,
  callback) {

  var self = this;

  var deviceID = Service._childNamed(xml, "DeviceID");

  debug("IsAuthorized('" + deviceID + "')");

  this.responseSoap(response, "IsAuthorized", {
    _name : "u:IsAuthorizedResponse",
    _attrs : {
      "xmlns:u" : self.type
    },
    _content : {
      Result : {
        _attrs : {
          "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
          "dt:dt" : "int"
        },
        _content : self.stateVars["A_ARG_TYPE_Result"].get()
      }
    }
  }, callback);
};

MediaReceiverRegistrar.prototype.processSoap_IsValidated = function(xml,
    request, response, callback) {

  var self = this;

  var deviceID = Service._childNamed(xml, "DeviceID");

  debug("IsValidated('" + deviceID + "')");

  this.responseSoap(response, "IsValidated", {
    _name : "u:IsValidatedResponse",
    _attrs : {
      "xmlns:u" : self.type
    },
    _content : {
      Result : {
        _attrs : {
          "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
          "dt:dt" : "int"
        },
        _content : self.stateVars["A_ARG_TYPE_Result"].get()
      }
    }
  }, callback);
};
