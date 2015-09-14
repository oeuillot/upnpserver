/*jslint node: true, vars: true, nomen: true, sub: true */
"use strict";

var Async = require("async");
var util = require('util');
var Device = require("./subdevice");

var MediaServer = function(rootdevice, route, _configuration, callback) {

  var self = this;

  Device.call(this,
        "urn:schemas-upnp-org:device:MediaServer",
        rootdevice,
        route,
        _configuration,
        function(err){


    var configuration = self.configuration;

    // override here
    self.ssdpHeadersCallback = function(heads, alive){};

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

    callback(err, self);
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
