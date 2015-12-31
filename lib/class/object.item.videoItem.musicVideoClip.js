/*jslint node: true, esversion: 6 */
"use strict";

const VideoItem = require('./object.item.videoItem');

class MusicVideoClip extends VideoItem {
  get name() { return MusicVideoClip.UPNP_CLASS; }
}

module.exports = MusicVideoClip;

MusicVideoClip.UPNP_CLASS = VideoItem.UPNP_CLASS + ".musicVideoClip";
