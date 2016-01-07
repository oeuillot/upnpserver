/*jslint node: true, esversion: 6 */
"use strict";

const ImageItem = require('./object.item.imageItem');

class Photo extends ImageItem {
  get name() { return Photo.UPNP_CLASS; }

  get mimeTypes() { return [ 'image/jpeg', 'image/jp2' ]; }  
}

module.exports = Photo;

Photo.UPNP_CLASS = ImageItem.UPNP_CLASS + ".photo";
