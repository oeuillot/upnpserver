/*jslint node: true, esversion: 6 */
"use strict";

const AudioItem = require('./object.item.audioItem');

class AudioBook extends AudioItem {
  get name() { return AudioBook.UPNP_CLASS; }
}

module.exports = AudioBook;

AudioBook.UPNP_CLASS = AudioItem.UPNP_CLASS + ".audioBook";
