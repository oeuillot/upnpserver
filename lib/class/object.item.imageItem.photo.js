/*jslint node: true, esversion: 6 */
"use strict";

const ImageItem = require('./object.item.imageItem');

const _UPNP_CLASS = ImageItem.UPNP_CLASS + ".photo";

class Photo extends ImageItem {
  get name() { return Photo.UPNP_CLASS; }

  get mimeTypes() { return [ 'image/jpeg', 'image/jp2' ]; }  

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports = Photo;
