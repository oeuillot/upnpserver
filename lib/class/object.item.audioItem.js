/*jslint node: true */
"use strict";

var Util = require('util');
var assert = require('assert');

var Res = require('./object.res');
var Item = require('./object.item');
var Xmlns = require('../xmlns');

var AudioItem = function() {
  Res.call(this);
};

Util.inherits(AudioItem, Res);

module.exports = AudioItem;

AudioItem.UPNP_CLASS = Item.UPNP_CLASS + ".audioItem";
AudioItem.prototype.name = AudioItem.UPNP_CLASS;

AudioItem.prototype.getDLNA_ProfileName = function(item) {
  switch (item.attributes.mime) {
  case "audio/mpeg":
    return "MP3";

    // Thanks to s-leger
  case "audio/ogg":
    return "OGG";

  case "audio/aac":
    return "AAC";

  case "audio/aacp":
    return "AAC";

  case "audio/L16":
    return "LPCM";

  case "audio/L16p":
    return "LPCM";
  }

  return Res.prototype.getDLNA_ProfileName.call(this, item);
};

AudioItem.prototype.toJXML = function(node, attributes, request,
    filterCallback, callback) {

  var self = this;

  Res.prototype.toJXML
      .call(
          this,
          node,
          attributes,
          request,
          filterCallback,
          function(error, xml) {
            if (error) {
              return callback(error);
            }

            var content = xml._content;

            if (filterCallback(Xmlns.DIDL_LITE, "res")) {
              if (attributes.duration) {
                var d = new Date(null);
                d.setSeconds(attributes.duration);
                Item._getNode(xml, "res")._attrs.duration =
                    d.toISOString().substr(11, 12);
              }
            }

            return callback(null, xml);
          });
};
