/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var SubDevice = require("./subdevice");
var _ = require("underscore");
var Uuid = require('node-uuid');

var _sonosConfig = {
  type: "urn:schemas-upnp-org:device:MediaRenderer",
  version : 1,
  name: "Sonos CONNECT Media Renderer",
  uuid : "RINCON_000E6829754801400_MR",
  services : {
    avTransport: "",
    connectionManager: "",
    renderingControl: ""
  }
}

var SonosMediaRenderer = function(rootdevice, route, _configuration, callback) {

  var self = this;

  SubDevice.call(this,
        _sonosConfig.type,
        rootdevice,
        route,
        _.extend(_sonosConfig, _configuration),
        function(err){ 
          callback(err,self);//self.addServices(callback);
     });

  return self;
};
module.exports = SonosMediaRenderer;

util.inherits(SonosMediaRenderer, SubDevice);

