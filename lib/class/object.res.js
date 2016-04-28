/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const debug = require('debug')('upnpserver:classes:object_res');

const Item = require('./object.item');
const Xmlns = require('../xmlns');

var ImageItem;

class Res extends Item { 
  constructor() {
    super();
    if (!ImageItem) {
      ImageItem = require('./object.item.imageItem');
    }
  }

  /**
   * 
   */
  toJXML(node, attributes, request, filterCallback, callback) {
    
    debug("toJXML", "node #",node.id, "attributes=",attributes);

    super.toJXML(node, attributes, request, filterCallback,
        (error, xml) => {
          if (error) {
            return callback(error);
          }

          var content = xml._content;

          if (filterCallback(Xmlns.UPNP_METADATA, "albumArtURI")) {
            if (attributes.albumArts) {
              var hashs = {};

              attributes.albumArts.forEach((albumArtInfo) => {

                if (ImageItem.isMimeTypeImage(albumArtInfo.mimeType)) {
                  if (albumArtInfo.hash) {
                    if (hashs[albumArtInfo.hash]) {
                      return;
                    }
                    hashs[albumArtInfo.hash] = true;
                  }

                  var aau = {
                      _name : "upnp:albumArtURI",
                      _content : request.contentURL + node.id + "/" + 
                          albumArtInfo.contentHandlerKey + "/" + albumArtInfo.key
                  };

                  if (request.dlnaSupport) {
                    var dlna = albumArtInfo.dlnaProfile || ImageItem.getDLNA(albumArtInfo.mimeType);
                    if (dlna) {
                      aau._attrs = {
                          "dlna:profileID" : dlna
                      };
                    }
                  }

                  content.push(aau);
                }
              });
            }
          }

          if (filterCallback(Xmlns.DIDL_LITE, "res")) {
            var res = attributes.res;
            if (!res && (node.contentURL || attributes.externalContentURL)) {
              _addRes(xml, [ {} ], request, node, filterCallback);
            }

            if (res) {
              res.forEach((r) => {
                _addRes(xml, r, request, node, filterCallback);
              });
            }
          }

          if (true) {
            if (filterCallback(Xmlns.PURL_ELEMENT, "date") && node.contentTime) {
              var dcDate = Item.getXmlNode(xml, "dc:date");
              if (!dcDate._content && node.contentTime) {
                dcDate._content = Item.toISODate(node.contentTime);
              }
            }
          }

          callback(null, xml);
        });
  }

  /**
   * 
   */
  getDLNA_ProfileName(item) {
    return "";
  }
}

function formatDuration(t) {
  var millis = Math.floor(t * 1000) % 1000;
  t = Math.floor(t);

  var seconds = t % 60;
  t = Math.floor(t / 60);

  var minutes = t % 60;
  t = Math.floor(t / 60);

  var hours = t;

  function pad(v, n) {
    var s = "0000" + v;
    return s.slice(-n);
  }

  return hours + ":" + pad(minutes, 2) + ":" + pad(seconds, 2); // + ":" +pad(millis, 3);
}

function format(attributeName, value) {
  if (attributeName === "duration") {
    if (typeof (value) === "number") {
      return formatDuration(value);
    }
  }

  return value;
}


const RES_PROPERTIES = [ 'size', 'duration', 'bitrate', 'sampleFrequency',
                         'bitsPerSample', 'nrAudioChannels', 'resolution', 'colorDepth', 'tspec',
                         'allowedUse', 'validityStart', 'validityEnd', 'remainingTime', 'usageInfo',
                         'rightsInfoURI', 'contentInfoURI', 'recordQuality', 'daylightSaving',
                         'framerate', 'importURI' ];

function _addRes(xml, res, request, node, filterCallback) {
  var attributes = node.attributes;

  var key = res.key || "main";
  key=String(key).replace(/[\/ ]/g, '_'); // Key can be not a string
  
  var resAttributes = {
      id : key
  };
  if (!res.key && attributes.size) {
    resAttributes.size = attributes.size;
  }
  
  var contentFormat = res.mimeType;
  if (!contentFormat && !res.key) {
    contentFormat = attributes.mimeType || node.contentURL.mimeLookup() || '';
  }
  
  if (contentFormat==='inode/directory') {
    return;
  }

  if (filterCallback(Xmlns.DIDL_LITE, "res", "protocolInfo")) {
    var protocol = "http-get";
    var network = res.network || "*";

    var additionalInfo = res.additionalInfo;

    if (request.dlnaSupport) {
      var pn = res.dlnaProfile;
      if (!pn) {
        if (/^image\//.exec(contentFormat)) {
          pn = ImageItem.getDLNA(contentFormat, res.width, res.height);
        }
      }

      var adds = [];
      if (additionalInfo) {
        adds.push(additionalInfo);
      }

      if (pn) {
        adds.push("DLNA.ORG_PN=" + pn);
      }
      adds.push("DLNA.ORG_FLAGS=00f00000000000000000000000000000");

      additionalInfo = adds.join(";");
    }

    var attrs = [ protocol, network, contentFormat, additionalInfo || "*" ].join(":");

    resAttributes.protocolInfo = attrs;
  }

  RES_PROPERTIES.forEach(function(n) {
    if (!filterCallback(Xmlns.DIDL_LITE, "res", n)) {
      return;
    }

    var val = res[n];
    if (!val) {
      return;
    }

    resAttributes[n] = format(n, val);
  });

  if (!resAttributes.resolution) {
    if (res.width && res.height) {
      resAttributes.resolution = res.width + "x" + res.height;
    }
  }

  if (request.secDlnaSupport) {
    if (res.acodec) {
      if (filterCallback(Xmlns.DIDL_LITE, "res", "sec:acodec")) {
        resAttributes["sec:acodec"] = res.acodec;
      }
    }

    if (res.vcodec) {
      if (filterCallback(Xmlns.DIDL_LITE, "res", "sec:vcodec")) {
        resAttributes["sec:vcodec"] = res.vcodec;
      }
    }
  }

  var contentURL;

  if (!res.key) {
    contentURL = attributes.externalContentURL || (request.contentURL + node.id);

  } else {
    contentURL = request.contentURL + node.id + "/" + res.contentHandlerKey + "/" + res.key;

    if (res.paramURL) {
      contentURL+="/"+res.paramURL;
    }
  }

  xml._content.push({
    _name : "res",
    _attrs : resAttributes,
    _content : contentURL
  });
  
  if (request.secDlnaSupport) {
    if (contentFormat==="text/srt") {
      if (filterCallback(Xmlns.SEC_DLNA, "CaptionInfoEx")) {
        xml._content.push({
          _name : "sec:CaptionInfoEx",
          _attrs : {
            'sec:type' : 'srt'
          },
          _content : contentURL
        });
      }
    }
  }
}

module.exports=Res;
