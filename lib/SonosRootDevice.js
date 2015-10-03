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
  uuid : "RINCON_000E5833333301400",
  hhid : "",
  initialConfigPort : 6969,
  serverName : "",
  services : {
    SonosAlarmClock: "",
    SonosDeviceProperties: "",
    SonosSystemProperties: "",
    SonosZoneGroupTopology: ""
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
      var len = msg.readUInt8(11);
      self.hhid = msg.slice(12, 11+len-1).toString();
      console.log(self.hhid);
      rootdevice.emit('HHID', self.hhid);
  });

  this.server.bind(_sonosConfig.initialConfigPort);   
  return self;
};
module.exports = SonosRootDevice;

util.inherits(SonosRootDevice, SubDevice);

SonosRootDevice.prototype.ssdpHeadersCallback = function(heads, alive) {
  var self = this;
  heads['X-RINCON-HOUSEHOLD'] = self.hhid;
  heads['X-RINCON-BOOTSEQ'] = 75;
};

/**
 * @param {string}
 *         segment : device level route segment starting by / or ""
 *                   url relative from description.xml
 *                   required only for rootDevices (first subdevice)
 */
SonosRootDevice.prototype.toJXML = function(segment, request, callback) {

  var serviceList = [];
  for (var route in this.services) {

    // prevent multiple service instances
    // to show in description
    if (route.indexOf("_id_") > -1) continue;

    this.services[route].pushServiceJXml(segment, serviceList);
  };

  var xml = {
    _name : "root",
    _attrs : {
      xmlns : SubDevice.UPNP_DEVICE_XMLNS
      },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      device : {
        deviceType : this.type,
        friendlyName : this.name,
        manufacturer : "Sonos, Inc.",
        manufacturerURL : "https://github.com/oeuillot/upnpserver",
        modelDescription : this.name,
        modelName : this.name, 
        modelURL : "https://github.com/oeuillot/upnpserver",
        modelNumber : "ZP90",
        serialNumber : "00-0E-58-33-33-33:C",
        softwareVersion : "29.5-91030",
	hardwareVersion : "1.1.16.4-1",

        UDN : this.uuid,
	zoneType: 1,
	feature1: 0x00310001,
	feature2: 0x0000617,
	feature3: 0x00030021,
	  internalSpeakerSize: -1,
	  bassExtension: "0.000",
	  satGainOffset: "0.000",
	  memory : 32,
	  flash : 32,
	  ampOnTime : 425,

        // must be relative to description path /
        //presentationURL : segment + "/index.html",

        iconList : [ {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 32,
            height : 32,
            depth : 24,
            url : segment + "/icons/icon_32.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 128,
            height : 128,
            depth : 24,
            url : segment + "/icons/icon_128.png"
          }
        }, {
          _name : "icon",
          _content : {
            mimetype : "image/png",
            width : 512,
            height : 512,
            depth : 24,
            url : segment + "/icons/icon_512.png"
          }
        } ],

        serviceList : serviceList
      }
    }
  };

  if (this.root.dlnaSupport) {
    xml._attrs["xmlns:dlna"] = SubDevice.DLNA_DEVICE_XMLNS;
    xml._content.device["dlna:X_DLNADOC"] = "DMS-1.50";
  }

  return callback(null, xml);
};
