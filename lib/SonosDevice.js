/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./device");
var _ = require("underscore")

var _sonosConfig = {
  type: "urn:schemas-upnp-org:device:ZonePlayer",
  vaersion : 1,
  name: "Sonos CONNECT",
  serverName : "",
  services : {
    //avTransport: "",
    //connectionManager: "",
    SonosDeviceProperties: ""
  }
}

var SonosDevice = function(api, _configuration, callback) {

  var self = this;

  Device.call(this,
        _sonosConfig.type,
        api,
        _.extend(_sonosConfig, _configuration),
        function(err){ 
          self.addServices(callback);
     });
     
  return self;
};
module.exports = SonosDevice;

util.inherits(SonosDevice, Device);

SonosDevice.prototype.toJXML = function(request, callback) {

  var serviceList = [];
  for (var route in this.services) {

    // prevent multiple service instances
    // to show in description
    if (route.indexOf("_") > -1) continue;

    serviceList.push(this.services[route].serviceToJXml());
  };
  var xml = {
    _name : "root",
    _attrs : {
      xmlns : Device.UPNP_DEVICE_XMLNS,
    },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      device : {
        deviceType : this.type,
        friendlyName : this.name,
        manufacturer : this.packageDescription.author,
        manufacturerURL : "https://github.com/oeuillot/Device",
        modelDescription : "Sonos CONNECT",
        modelName : "Sonos CONNECT",
        modelURL : "https://github.com/oeuillot/Device",
        modelNumber : this.packageDescription.version,
        serialNumber : "1.2",
        UDN : this.uuid,
        //presentationURL : "http://" + this.ip + ":" + this.port + "/index.html",

        iconList : [ {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 32,
            height : 32,
            depth : 24,
            url : "/icons/icon_32.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 128,
            height : 128,
            depth : 24,
            url : "/icons/icon_128.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 512,
            height : 512,
            depth : 24,
            url : "/icons/icon_512.png"
          }
        } ],

        serviceList : serviceList
      }
    }
  };

  return callback(null, xml);
};

