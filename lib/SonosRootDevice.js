/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var SubDevice = require("./subdevice");
var _ = require("underscore");
var dgram = require("dgram");
var Uuid = require('node-uuid');

var _sonosConfig = {
  type: "urn:schemas-upnp-org:device:ZonePlayer",
  version : 1,
  name: "Sonos CONNECT",
  uuid : "RINCON_000E6829754801400_MR",
  hhid : "",
  initialConfigPort : 6969,
  serverName : "",
  services : {
    //avTransport: "",
    //connectionManager: "",
    SonosDeviceProperties: ""
  }
}

var SonosRootDevice = function(rootdevice, route, _configuration, callback) {

  var self = this;

  SubDevice.call(this,
        _sonosConfig.type,
        rootdevice,
        route,
        _.extend(_sonosConfig, _configuration),
        function(err){ 
          callback(err,self);//self.addServices(callback);
     });

  this.server = dgram.createSocket("udp4");

  this.server.on("message", function (msg, rinfo) {
      //console.log("server got: " + msg + " from " +
	//	  rinfo.address + ":" + rinfo.port);
      var index = msg.toString('ascii').indexOf('HHID_');
      var end = msg.toString('ascii').indexOf('\0',index);
      this.hhid = msg.slice(index,end-1).toString();
      api.ssdpServer.hhid = this.hhid;
      //console.log(this.hhid);
  });

  this.server.bind(_sonosConfig.initialConfigPort);   
  return self;
};
module.exports = SonosRootDevice;

util.inherits(SonosRootDevice, SubDevice);

