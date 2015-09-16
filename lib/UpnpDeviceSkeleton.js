/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var util = require('util');
var SubDevice = require("./subdevice");

var YourDeviceType = function(rootdevice, route, _configuration, callback) {

  var self = this;

  // TODO: adjust xmlns and device type

  SubDevice.call(this,
        "urn:schemas-upnp-org:device:YourDeviceType",
        rootdevice,
        route,
        _configuration,
        function(err){


    var configuration = self.configuration;

    // TODO: handle ssdp vendor headers or remove this
    this.ssdpHeadersCallback = function(heads, alive){};

    // TODO: setup a default services configuration for this device
    if (!configuration.services) {
      
      configuration.services = {
        connectionManager:"",
        contentDirectory:""
      };

    }

    callback(err, self);
  });

  return self;
};
module.exports = YourDeviceType;

util.inherits(YourDeviceType, SubDevice);
