/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./device");
var Player = require("./player");

var MediaRender = function(api, _configuration, callback) {

  var self = this;

  Device.call(this,
        "urn:schemas-upnp-org:device:MediaRender",
        api,
        _configuration,
        function(err){


    var configuration = self.configuration;

    var player = configuration.player || "Player";
    var Player = require("./" + player);

    if (!configuration.services) {
      configuration.services = {
        connectionManager:"",
        avTransport:"",
        renderingControl:""
      };
    }
    self.addServices(function(){

      self.player = new Player(self.services["avt"],self.services["cms"],self.services["rcs"]);

      callback();
    });

  });

  return self;
};
module.exports = MediaRender;

util.inherits(MediaRender, Device);
