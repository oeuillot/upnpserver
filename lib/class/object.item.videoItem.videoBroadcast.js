/*jslint node: true */
"use strict";

var Util = require('util');

var VideoItem = require('./object.item.videoItem');

var VideoBroadcast = function() {
};

Util.inherits(VideoBroadcast, VideoItem);

module.exports = VideoBroadcast;

VideoBroadcast.UPNP_CLASS = VideoItem.UPNP_CLASS + ".videoBroadcast";
VideoBroadcast.prototype.name = VideoBroadcast.UPNP_CLASS;
