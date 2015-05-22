/*jslint node: true */
"use strict";

var Util = require('util');

var Res = require('./object.res');
var Item = require('./object.item');

var ImageItem = function() {
};

Util.inherits(ImageItem, Res);

module.exports = ImageItem;

ImageItem.UPNP_CLASS = Item.UPNP_CLASS + ".imageItem";
ImageItem.prototype.name = ImageItem.UPNP_CLASS;

ImageItem.prototype.mimeTypes = [ 'image/*' ];

ImageItem.prototype.getDLNA_ProfileName = function(item) {

  var attributes = item.attributes;
  var w = attributes.width;
  var h = attributes.height;

  switch (attributes.mime) {
  case "image/jpeg":
    if (w > 0 && h > 0) {
      if (w === 48 && h === 48) {
        return "JPEG_SM_ICO";
      }

      if (w === 120 && h === 120) {
        return "JPEG_LRG_ICO";
      }

      if (w <= 160 && h <= 160) {
        return "JPEG_TN";
      }

      if (w <= 640 && h <= 480) {
        return "JPEG_SM";
      }

      if (w <= 1024 && h <= 768) {
        return "JPEG_MED";
      }

      if (w <= 4096 && h <= 4096) {
        return "JPEG_LRG";
      }
      return "";
    }

    return "JPEG_LRG";

  case "image/png":
    if (w > 0 && h > 0) {
      if (w === 48 && h === 48) {
        return "PNG_SM_ICO";
      }

      if (w === 120 && h === 120) {
        return "PNG_LRG_ICO";
      }

      if (w <= 160 && h <= 160) {
        return "PNG_TN";
      }

      if (w <= 4096 && h <= 4096) {
        return "PNG_LRG";
      }
      return "";
    }

    return "PNG_LRG";
  }

  return Res.prototype.getDLNA_ProfileName.call(this, item);
};
