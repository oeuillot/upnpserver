/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Res = require('./object.res');
var Item = require('./object.item');
var Xmlns = require('../xmlns');

var AudioItem = function() {
  Res.call(this);
};

Util.inherits(AudioItem, Res);

module.exports = AudioItem;

AudioItem.UPNP_CLASS = Item.UPNP_CLASS + ".audioItem";
AudioItem.prototype.name = AudioItem.UPNP_CLASS;

AudioItem.prototype.getDLNA_ProfileName = function(item) {
  switch (item.attributes.mime) {
  case "audio/mpeg":
    return "MP3";

    // Thanks to s-leger
  case "audio/ogg":
    return "OGG";

  case "audio/aac":
    return "AAC";

  case "audio/aacp":
    return "AAC";

  case "audio/L16":
    return "LPCM";

  case "audio/L16p":
    return "LPCM";
  }

  return Res.prototype.getDLNA_ProfileName.call(this, item);
};

