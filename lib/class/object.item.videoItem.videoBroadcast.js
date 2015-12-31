/*jslint node: true, esversion: 6 */
"use strict";

const VideoItem = require('./object.item.videoItem');

class VideoBroadcast extends VideoItem {
  get name() { return VideoBroadcast.UPNP_CLASS; }
}

module.exports = VideoBroadcast;

VideoBroadcast.UPNP_CLASS = VideoItem.UPNP_CLASS + ".videoBroadcast";
