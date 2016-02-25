/*jslint node: true, esversion: 6 */
"use strict";

const Res = require('./object.res');
const Item = require('./object.item');

const _UPNP_CLASS = Item.UPNP_CLASS + ".imageItem";

class ImageItem extends Res {
  get name() { return ImageItem.UPNP_CLASS; }
  
  get mimeTypes() { return  [ 'image/*' ]; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  getDLNA_ProfileName(item) {

    var attributes = item.attributes;
    var w = attributes.width;
    var h = attributes.height;
    
    var dlna=ImageItem.getDLNA(attributes.mimeType, w, h);
    if (dlna) {
      return dlna;
    }

    return super.getDLNA_ProfileName(item);
  }

  static isMimeTypeImage(mimeType) {
    return mimeType && mimeType.indexOf("image/") === 0;
  }

  static getDLNA(mimeType, w, h) {

    switch (mimeType) {
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

        /*
        if (w <= 640 && h <= 480) {
          return "PNG_SM";
        }
        */

        if (w <= 4096 && h <= 4096) {
          return "PNG_LRG";
        }
        return "";
      }

      return "PNG_LRG";
    }

    return undefined;
  }
}

module.exports = ImageItem;
