/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./device");

var UpnpServer = function(api, _configuration, callback) {

  var self = this;

  Device.call(this,
        "urn:schemas-upnp-org:device:MediaServer:1",
        api,
        _configuration,
        function(err){

    var configuration = self.configuration;

    self.MicrosoftSupport = !!configuration.microsoft;

    if (!configuration.services) {
      configuration.services = {
        ConnectionManager:configuration.ConnectionManager,
        ContentDirectory:configuration.ContentDirectory,
      };

      if (self.MicrosoftSupport && self.dlnaSupport) {
        configuration.services["MediaReceiverRegistrar"] =
              configuration.MediaReceiverRegistrar;
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
