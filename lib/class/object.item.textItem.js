/*jslint node: true */
"use strict";

var Util = require('util');

var Res = require('./object.res');
var Item = require('./object.item');

var TextItem = function() {
};

Util.inherits(TextItem, Res);

module.exports = TextItem;

TextItem.UPNP_CLASS = Item.UPNP_CLASS + ".TextItem";
TextItem.prototype.name = TextItem.UPNP_CLASS;

TextItem.prototype.mimeTypes = [ 'text/*' ];
