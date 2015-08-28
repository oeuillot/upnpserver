/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./device");

var ContentDirectoryService = require("./contentDirectoryService");
var ConnectionManagerService = require("./connectionManagerService");
var MediaReceiverRegistrarService = require("./mediaReceiverRegistrarService");

var UpnpServer = function(ssdp, ip, _configuration, callback) {

  var self = this;
  self.type = "urn:schemas-upnp-org:device:MediaServer:1";

  Device.call(this, ssdp, ip, _configuration, function(err){

    var configuration = self.configuration;

    self.MicrosoftSupport = !!configuration.microsoft;

    if (!configuration.services) {
      configuration.services = [ new ConnectionManagerService(configuration.cms),
          new ContentDirectoryService(configuration.cds) ];

      if (self.MicrosoftSupport && self.dlnaSupport) {
        configuration.services.push(new MediaReceiverRegistrarService(
            configuration.mrr));
      }
    }
    console.log("upnpServer addServices");

    self.addServices(callback);

  });

  return self;
};
module.exports = UpnpServer;

util.inherits(UpnpServer, Device);

/**
 *
 * @param {Repository[]}
 *            repositories
 * @param {Function}
 *            callback
 * @deprecated
 */
UpnpServer.prototype.setRepositories = function(repositories, callback) {
  this.addRepositories(repositories, callback);
};

UpnpServer.prototype.addRepositories = function(repositories, callback) {
  this.services["cds"].addRepositories(repositories, callback);
};
