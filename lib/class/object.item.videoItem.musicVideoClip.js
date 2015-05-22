/*jslint node: true */
"use strict";

var Util = require('util');

var VideoItem = require('./object.item.videoItem');

var MusicVideoClip = function() {
};

Util.inherits(MusicVideoClip, VideoItem);

module.exports = MusicVideoClip;

MusicVideoClip.UPNP_CLASS = VideoItem.UPNP_CLASS + ".musicVideoClip";
MusicVideoClip.prototype.name = MusicVideoClip.UPNP_CLASS;
