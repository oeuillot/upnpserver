/*jslint node: true */
"use strict";

var Util = require('util');

var Service = require("./service");

var MediaReceiverRegistrar = function() {
  Service.call(this, {
    serviceType : "urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1",
    serviceId : "urn:microsoft.com:serviceId:X_MS_MediaReceiverRegistrar",
    scpdURL : "/mediaReceiver.xml",
    controlURL : "/mediaReceiver/control",
    eventSubURL : "/mediaReceiver/event"
  });

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

  this.addType("A_ARG_TYPE_DeviceID", false, "string");
  this.addType("A_ARG_TYPE_RegistrationReqMsg", false, "bin.base64");
  this.addType("A_ARG_TYPE_RegistrationRespMsg", false, "bin.base64");
  this.addType("A_ARG_TYPE_Result", false, "int");
  this.addType("AuthorizationDeniedUpdateID", true, "ui4");
  this.addType("AuthorizationGrantedUpdateID", true, "ui4");
  this.addType("ValidationRevokedUpdateID", true, "ui4");
  this.addType("ValidationSucceededUpdateID", true, "ui4");

  this.authorizationDeniedUpdateID = 1;
  this.authorizationGrantedUpdateID = 1;
  this.validationRevokedUpdateID = 1;
  this.validationSucceededUpdateID = 1;

  var self = this;
  this._intervalTimer = setInterval(function() {
    self._sendPropertyChangesEvent();
  }, 1500);

};

Util.inherits(MediaReceiverRegistrar, Service);

module.exports = MediaReceiverRegistrar;

MediaReceiverRegistrar.prototype.processSoap_RegisterDevice = function(xml,
    request, response, callback) {

  return callback();
};

MediaReceiverRegistrar.prototype.processSoap_IsAuthorized = function(xml,
    request, response, callback) {

  var deviceID = Service._childNamed(xml, "DeviceID");

  console.log("IsAuthorized('" + deviceID + "')");

  this.responseSoap(response, "IsAuthorized", {
    _name : "u:IsAuthorizedResponse",
    _attrs : {
      "xmlns:u" : this.type
    },
    _content : {
      Result : {
        _attrs : {
          "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
          "dt:dt" : "int"
        },
        _content : "1"
      }
    }
  }, callback);
};

MediaReceiverRegistrar.prototype.processSoap_IsValidated = function(xml,
    request, response, callback) {

  var deviceID = Service._childNamed(xml, "DeviceID");

  console.log("IsValidated('" + deviceID + "')");

  this.responseSoap(response, "IsValidated", {
    _name : "u:IsValidatedResponse",
    _attrs : {
      "xmlns:u" : this.type
    },
    _content : {
      Result : {
        _attrs : {
          "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
          "dt:dt" : "int"
        },
        _content : "1"
      }
    }
  }, callback);
};

MediaReceiverRegistrar.prototype._sendPropertyChangesEvent = function() {

  var props = {
    "s:AuthorizationGrantedUpdateID" : this.authorizationGrantedUpdateID,
    "s:AuthorizationDeniedUpdateID" : this.authorizationDeniedUpdateID,
    "s:ValidationRevokedUpdateID" : this.validationRevokedUpdateID,
    "s:ValidationSucceededUpdateID" : this.validationSucceededUpdateID
  };

  var xmlContent = [];

  for ( var key in props) {
    xmlContent.push({
      _name : "e:property",
      _content : {
        _name : key,
        _attrs : {
          "xmlns:dt" : "urn:schemas-microsoft-com:datatypes",
          "dt:dt" : "ui4"
        },
        _content : props[key]
      }
    });
  }

  xmlContent = {
    _name : "e:propertyset",
    _attrs : {
      xmlns : "urn:schemas-upnp-org:service-1-0",
      "xmlns:e" : "urn:schemas-upnp-org:event-1-0",
      "xmlns:s" : this.type
    },
    _content : xmlContent
  };

  this.sendEvent("upnp:propchange", xmlContent);
};
