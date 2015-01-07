/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');
var mm = require('musicmetadata');
var fs = require('fs');

var Res = require('./object.res');
var Item = require('./object.item');
var logger = require('../logger');

var AudioItem = function() {
};

Util.inherits(AudioItem, Res);

module.exports = AudioItem;

AudioItem.UPNP_CLASS = Item.UPNP_CLASS + ".audioItem";

AudioItem.prototype.getDLNA_PN = function(item) {
  switch (item.attributes.mime) {
  case "audio/mpeg":
    return "MP3";
  }

  return Res.prototype.getDLNA_PN.call(this, item);
};
