/*jslint node: true, esversion: 6 */
"use strict";

const Res = require('./object.res');
const Item = require('./object.item');

const _UPNP_CLASS = Item.UPNP_CLASS + ".textItem";

class TextItem extends Res {
  get name() { return TextItem.UPNP_CLASS; }

  get mimeTypes() { return [ 'text/*' ]; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }
}

module.exports=TextItem;
