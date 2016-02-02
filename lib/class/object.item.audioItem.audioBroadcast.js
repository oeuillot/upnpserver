/*jslint node: true, esversion: 6 */
"use strict";

const AudioItem = require('./object.item.audioItem');

class AudioBroadcast extends AudioItem { 
  get name() { return AudioBroadcast.UPNP_CLASS; }
}

module.exports = AudioBroadcast;

AudioBroadcast.UPNP_CLASS = AudioItem.UPNP_CLASS + ".audioBroadcast";
