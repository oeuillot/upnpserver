/*jslint node: true, esversion: 6 */
"use strict";

const debug= require('debug')('upnpserver:util:AlphaNormalizer');
const logger = require('../logger');


const ACCENTS_MAPPER = [ /[áãàâäåāăąǎǟǡǻ]/g, 'a', /[çćĉċč]/g, 'c', /[ďđ]/g, 'd',
                         /[éèêëēĕėęěǝǯ]/g, 'e', /[ĝğġģǥǧǵ]/g, 'g', /[ĥħ]/g, 'h', /[íìîïĩīĭįıǐ]/g,
                         'i', /[ĵǰ]/g, 'j', /[ķǩ]/g, 'k', /[ĺļľŀł]/g, 'l', /[ñńņňŉŋǹ]/g, 'n',
                         /[óõòôöōŏőǒǫǭǿ]/g, 'o', /[ŕŗř]/g, 'r', /[śŝşš]/g, 's', /[ţťŧ]/g, 't',
                         /[úùûüµǔǖǘǚǜ]/g, 'u', /[ýÿ]/g, 'y', /[źżžƶ]/g, 'z', /[œ]/g, 'oe', /[æǽǣ]/g,
                         'ae', /[ĳ]/g, 'ij', /[ǳǆ]/g, 'dz', /[ǉ]/g, 'lj', /[ǌ]/g, 'nj' ];

class AlphaNormalizer {

  static normalize(s) {
    if (typeof (s) !== "string") {
      return s;
    }
    s = s.toLowerCase().trim();

    for (var i = 0; i < ACCENTS_MAPPER.length;) {
      var expr = ACCENTS_MAPPER[i++];
      var code = ACCENTS_MAPPER[i++];

      s = s.replace(expr, code);
    }

    return s;
  }
}

module.exports = AlphaNormalizer;

