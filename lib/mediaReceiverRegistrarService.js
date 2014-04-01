/*jslint node: true */
"use strict";

var Util = require('util');

var Service = require("./service");

var MediaReceiverRegistrar = function() {
    Service
	    .call(
		    this,
		    {
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
}

Util.inherits(MediaReceiverRegistrar, Service);

module.exports = MediaReceiverRegistrar;