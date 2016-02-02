/*jslint node: true, esversion: 6 */
"use strict";

const Res = require('./object.res');
const Item = require('./object.item');

class TextItem extends Res {
  get name() { return TextItem.UPNP_CLASS; }

  get mimeTypes() { return [ 'text/*' ]; }
}

module.exports=TextItem;

TextItem.UPNP_CLASS = Item.UPNP_CLASS + ".textItem";
