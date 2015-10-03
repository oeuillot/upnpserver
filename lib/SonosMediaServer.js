/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var SubDevice = require("./subdevice");
var _ = require("underscore");
var Uuid = require('node-uuid');

var _sonosConfig = {
  type: "urn:schemas-upnp-org:device:MediaServer",
  version : 1,
  name: "Sonos CONNECT Media Server",
  uuid : "RINCON_000E5833333301400_MS",
  services : {
    connectionManager: "",
    contentDirectory: {
       paths: "./"
    }
  }
}

var SonosMediaServer = function(rootdevice, route, _configuration, callback) {

  var self = this;

  SubDevice.call(this,
        _sonosConfig.type,
        rootdevice,
        route,
        _.extend(_sonosConfig, _configuration),
        function(err){ 
          callback(err,self);
     });

  rootdevice.on('HHID', function(hhid) {
     self.hhid = hhid;
  });
  return self;
};
module.exports = SonosMediaServer;

util.inherits(SonosMediaServer, SubDevice);

SonosMediaServer.prototype.ssdpHeadersCallback = function(heads, alive) {
  var self = this;
  heads['X-RINCON-HOUSEHOLD'] = self.hhid;
  heads['X-RINCON-BOOTSEQ'] = 75;
};

