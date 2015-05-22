/*jslint node: true */
"use strict";

var Util = require('util');

var AudioItem = require('./object.item.audioItem');

var AudioBook = function() {
};

Util.inherits(AudioBook, AudioItem);

module.exports = AudioBook;

AudioBook.UPNP_CLASS = AudioItem.UPNP_CLASS + ".audioBook";
AudioBook.prototype.name = AudioBook.UPNP_CLASS;
