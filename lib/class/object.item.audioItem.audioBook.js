/*jslint node: true, esversion: 6 */
"use strict";

const AudioItem = require('./object.item.audioItem');

const _UPNP_CLASS = AudioItem.UPNP_CLASS + ".audioBook";

class AudioBook extends AudioItem {
  get name() { return AudioBook.UPNP_CLASS; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = AudioBook;
