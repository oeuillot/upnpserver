/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Res = require('./object.res');
var Item = require('./object.item');
var logger = require('../logger');

var AudioItem = function() {
};

Util.inherits(AudioItem, Res);

module.exports = AudioItem;

AudioItem.UPNP_CLASS = Item.UPNP_CLASS + ".audioItem";
AudioItem.prototype.name = AudioItem.UPNP_CLASS;

AudioItem.prototype.getDLNA_ProfileName = function(item) {
  switch (item.attributes.mime) {
  case "audio/mpeg":
    return "MP3";
  }

  return Res.prototype.getDLNA_ProfileName.call(this, item);
};
