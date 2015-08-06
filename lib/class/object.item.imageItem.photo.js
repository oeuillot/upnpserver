/*jslint node: true */
"use strict";

var Util = require('util');

var ImageItem = require('./object.item.imageItem');

var Photo = function() {
  ImageItem.call(this);
};

Util.inherits(Photo, ImageItem);

module.exports = Photo;

Photo.UPNP_CLASS = ImageItem.UPNP_CLASS + ".photo";
Photo.prototype.name = Photo.UPNP_CLASS;

Photo.prototype.mimeTypes = [ 'image/jpeg' ];