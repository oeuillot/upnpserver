/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./device");

var MediaServer = function(api, _configuration, callback) {

  var self = this;

  Device.call(this,
        "urn:schemas-upnp-org:device:MediaServer",
        api,
        _configuration,
        function(err){


    var configuration = self.configuration;

    self.MicrosoftSupport = !!configuration.microsoft;

    if (!configuration.services) {
      configuration.services = {
        connectionManager:configuration.connectionManager,
        contentDirectory:configuration.contentDirectory,
      };

      if (self.MicrosoftSupport && self.dlnaSupport) {
        configuration.services["mediaReceiverRegistrar"] =
              configuration.mediaReceiverRegistrar;
      }
    }
    self.addServices(callback);

  });

  return self;
};
module.exports = MediaServer;

util.inherits(MediaServer, Device);

/**
 *
 * @param {Repository[]}
 *            repositories
 * @param {Function}
 *            callback
 * @deprecated
 */
MediaServer.prototype.setRepositories = function(repositories, callback) {
  this.addRepositories(repositories, callback);
};

MediaServer.prototype.addRepositories = function(repositories, callback) {
  this.services["cds"].addRepositories(repositories, callback);
};
