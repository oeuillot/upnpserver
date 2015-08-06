/*jslint node: true */
"use strict";

var Util = require('util');

var AudioItem = require('./object.item.audioItem');

var AudioBroadcast = function() {
  AudioItem.call(this);
};

Util.inherits(AudioBroadcast, AudioItem);

module.exports = AudioBroadcast;

AudioBroadcast.UPNP_CLASS = AudioItem.UPNP_CLASS + ".audioBroadcast";
AudioBroadcast.prototype.name = AudioBroadcast.UPNP_CLASS;
