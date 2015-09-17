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

var  SonosSystemProperties = function(device, classPrefix, configuration) {

  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:SystemProperties",
    serviceId : "urn:upnp-org:serviceId:SystemProperties",
    route: "sp"
  }, configuration);

  var self = this;

  this.addAction("SetString", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"},
		   { name: "StringValue", type: "A_ARG_TYPE_VariableStringValue"} ],
		 []);
  this.addAction("SetStringX", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"},
		   { name: "StringValue", type: "A_ARG_TYPE_VariableStringValue"} ],
		 []);
  this.addAction("GetString", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"} ],
		 [ { name: "StringValue", type: "A_ARG_TYPE_VariableStringValue"} ]);
  this.addAction("GetStringX", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"} ],
		 [ { name: "StringValue", type: "A_ARG_TYPE_VariableStringValue"} ]);
  this.addAction("Remove", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"} ],
		 []);
  this.addAction("RemoveX", 
		 [ { name: "VariableName", type: "A_ARG_TYPE_VariableName"} ],
		 []);
  this.addAction("GetWebCode", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"} ],
		 [ { name: "WebCode", type: "A_ARG_TYPE_VariableStringValue"} ]);
  this.addAction("ProvisionTrialAccount", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"} ],
		 [ { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"} ]);
  this.addAction("ProvisionCredentialedTrialAccountX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "AccountPassword", type: "A_ARG_TYPE_AccountPassword"} ],
		 [ { name: "IsExpired", type: "A_ARG_TYPE_IsExpired"},
		   { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"} ]);
  this.addAction("MigrateTrialAccountX", 
		 [ { name: "TargetAccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "TargetAccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "TargetAccountPassword", type: "A_ARG_TYPE_AccountPassword"} ],
		 []);
  this.addAction("AddAccountX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "AccountPassword", type: "A_ARG_TYPE_AccountPassword"} ],
		 [ { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"} ]);
  this.addAction("AddAccountWithCredentialX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountToken", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "AccountKey", type: "A_ARG_TYPE_AccountCredential"} ],
		 []);
  this.addAction("AddOAuthAccountWX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountToken", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "AccountKey", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "OAuthDeviceID", type: "A_ARG_TYPE_OAuthDeviceID"} ],
		 [ { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"} ]);
  this.addAction("RemoveAccount", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountID", type: "A_ARG_TYPE_AccountID"} ],
		 []);
  this.addAction("EditAccountPasswordX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "NewAccountPassword", type: "A_ARG_TYPE_AccountPassword"} ],
		 []);
  this.addAction("SetAccountNicknameX", 
		 [ { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"},
		   { name: "AccountNickname", type: "A_ARG_TYPE_AccountNickname"} ],
		 []);
  this.addAction("RefreshAccountCredentialsX", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountUID", type: "A_ARG_TYPE_AccountUID"},
		   { name: "AccountToken", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "AccountKey", type: "A_ARG_TYPE_AccountCredential"} ],
		 []);
  this.addAction("EditAccountMd", 
		 [ { name: "AccountType", type: "A_ARG_TYPE_AccountType"},
		   { name: "AccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "NewAccountMd", type: "A_ARG_TYPE_AccountMd"} ],
		 []);
  this.addAction("DoPostUpdateTasks", [], []);
  this.addAction("ResetThirdPartyCredentials", [], []);
  this.addAction("EnableRDM", 
		 [ { name: "RDMValue", type: "A_ARG_TYPE_RDMEnabled"} ],
		 []);
  this.addAction("GetRDM", 
		 [],
		 [ { name: "RDMValue", type: "A_ARG_TYPE_RDMEnabled"} ]);
  this.addAction("ReplaceAccountX", 
		 [ { name: "AccountUDN", type: "A_ARG_TYPE_AccountUDN"},
		   { name: "NewAccountID", type: "A_ARG_TYPE_AccountID"},
		   { name: "NewAccountPassword", type: "A_ARG_TYPE_AccountPassword"},
		   { name: "AccountToken", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "AccountKey", type: "A_ARG_TYPE_AccountCredential"},
		   { name: "OAuthDeviceID", type: "A_ARG_TYPE_OAuthDeviceID"} ],
		 [ { name: "NewAccountUDN", type: "A_ARG_TYPE_AccountUDN"} ]);

  this.addType("A_ARG_TYPE_VariableName", "string", "");
  this.addType("A_ARG_TYPE_VariableStringValue", "string", "");
  this.addType("A_ARG_TYPE_AccountType", "ui4", 0);
  this.addType("A_ARG_TYPE_AccountUID", "ui4", 0);
  this.addType("A_ARG_TYPE_AccountUDN", "string", "");
  this.addType("A_ARG_TYPE_AccountID", "string", 0);
  this.addType("A_ARG_TYPE_AccountPassword", "string", "");
  this.addType("A_ARG_TYPE_AccountNickname", "string", "");
  this.addType("A_ARG_TYPE_AccountCredential", "string", "");
  this.addType("A_ARG_TYPE_AccountMd", "string", "");
  this.addType("A_ARG_TYPE_IsExpired", "boolean", false);
  this.addType("A_ARG_TYPE_RDMEnabled", "boolean", false);
  this.addType("A_ARG_TYPE_OAuthDeviceID", "string", "");
  this.addType("UpdateID", "ui4", 0, [], "", true);
  this.addType("ThirdPartyHash", "string", "", [], "", true);

  return this;
}

Util.inherits(SonosSystemProperties, Service);
module.exports = SonosSystemProperties;

