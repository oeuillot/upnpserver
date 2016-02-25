/*jslint node: true, esversion: 6 */
"use strict";

const VideoItem = require('./object.item.videoItem');

const _UPNP_CLASS = VideoItem.UPNP_CLASS + ".videoBroadcast";

class VideoBroadcast extends VideoItem {
  get name() { return VideoBroadcast.UPNP_CLASS; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = VideoBroadcast;
