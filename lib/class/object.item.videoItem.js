/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const debug = require('debug')('upnpserver:class:object.item.videoItem');

const Res = require('./object.res');
const Item = require('./object.item');
const Xmlns = require('../xmlns');

const _UPNP_CLASS = Item.UPNP_CLASS + ".videoItem";

class VideoItem extends Res {
  get name() { return VideoItem.UPNP_CLASS; }

  get mimeTypes() { return [ 'video/*' ]; }

  static get UPNP_CLASS() {
    return _UPNP_CLASS;
  }

  /**
   * 
   */
  getDLNA_ProfileName(node) {
    switch (node.attributes.mimeType) {
    case "video/mpeg":
      return "MPEG_PS_PAL";
    }

    return super.getDLNA_ProfileName(node);
  }

  /**
   * 
   */
  toJXML(node, attributes, request,
      filterCallback, callback) {

    super.toJXML(node, attributes, request, filterCallback,
        (error, xml) => {
          if (error) {
            return callback(error);
          }

          var content = xml._content;

          // <sec:CaptionInfoEx sec:type="srt">http://192.168.0.191:17679/SubtitleProvider/41.SRT</sec:CaptionInfoEx>
          // xmlns:sec="http://www.sec.co.kr/dlna

          var description;

          if (filterCallback(Xmlns.PURL_ELEMENT, "description")) {
            if (attributes.description) {
              description = attributes.description;

              content.push({
                _name : "dc:description",
                _content : description
              });
            }
          }

          if (filterCallback(Xmlns.UPNP_METADATA, "longDescription")) {
            if (attributes.longDescription &&
                description !== attributes.longDescription) {
              content.push({
                _name : "upnp:longDescription",
                _content : attributes.longDescription
              });
            }
          }

          return callback(null, xml);
        });
  }
}

module.exports = VideoItem;
