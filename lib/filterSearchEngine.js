/*jslint node: true, sub: true */
"use strict";

var debug = require('debug')('upnpserver:filterSearchEngine');

var Xmlns = require('./xmlns');

var _splitXmlnsNameRegExp = /([^:]+:)?([^@]+)(@.*)?$/i;

function returnTRUE() {
  return true;
}

var defaultNamespaceURIs = {
  "" : Xmlns.DIDL_LITE,
  dc : Xmlns.PURL_ELEMENT,
  upnp : Xmlns.UPNP_METADATA,

//Lame FREEBOX xmlns declaration !!!!
  sec : Xmlns.SEC_DLNA_XMLNS
};

var defaultFilters = {};
defaultFilters[Xmlns.DIDL_LITE] = {
  "item" : {
    id : true,
    parentID : true,
    refID : true,
    restricted : true
  },
  "container" : {
    id : true,
    parentID : true,
    refID : true,
    restricted : true,
    childCount : true
  }
};
/*
defaultFilters[Xmlns.UPNP_METADATA] = {
  "class" : {
    '*' : true
  }
};
defaultFilters[Xmlns.PURL_ELEMENT] = {
  "title" : {
    '*' : true
  }
};
*/
function FilterSearchEngine(contentDirectoryService, filterNode, searchNode) {
  this.contentDirectoryService = contentDirectoryService;
  this.filterNode = filterNode;
  this.searchNode = searchNode;
  
  if (filterNode) {
    var func = prepareFilterCallback(filterNode.val, filterNode.namespaceURIs);

    if (func) {
      this._filterFunc = func;

    } else {
      filterNode = null;
    }
  }

  if (!this._filterFunc && !this._searchFunc) {
    // No functions at all
    
    this.func = returnTRUE;
    return;
  }
  
  this.func=this.process.bind(this);
}

module.exports = FilterSearchEngine;

FilterSearchEngine.prototype.start = function(node) {
  this.currentNode = node;
  this._ignore=undefined;
};

FilterSearchEngine.prototype.process = function(ns, element, attribute) {
  if (this._ignore) {
    return false;
  }
  
  var filterFunc = this._filterFunc;
  if (filterFunc) {
    return filterFunc(ns, element, attribute);
  }

  return true;
};

FilterSearchEngine.prototype.end = function(jxml) {
  this.currentNode = null;
  
  if (this._ignore) {
    return null;
  }
  return jxml;
};


function prepareFilterCallback(filterExpression, namespaceURIs) {
  if (!filterExpression || filterExpression === "*") {
    return false;
  }

  var filters = {};

  filterExpression.split(',').forEach(
      function(token) {
        var sp = _splitXmlnsNameRegExp.exec(token);
        if (!sp) {
          console.error("Unknown filter token format '" + token + "'");
          return;
        }

        // console.log("Register: ", sp);

        var prefix = (sp[1] && sp[1].slice(0, -1)) || "";
        var element = sp[2];
        var attribute = (sp[3] && sp[3].slice(1)) || "*";

        var xmlns = namespaceURIs[prefix] || defaultNamespaceURIs[prefix];
        if (!xmlns) {
          debug("Unknown xmlns for prefix", prefix, " token=", token,
              " namespaceURIs=", namespaceURIs);
          return;
        }

        var fs = filters[xmlns];
        if (!fs) {
          fs = {};
          filters[xmlns] = fs;
        }

        var elt = fs[element];
        if (!elt) {
          elt = {};
          fs[element] = elt;
        }

        elt[attribute] = true;
      });

  return function(ns, element, attribute) {
    if (!attribute) {
      attribute = "*";
    }

    var df = defaultFilters[ns];
    var dfe;
    if (df) {
      dfe = df[element];
      if (dfe && (dfe[attribute] || dfe['*'])) {
        return true;
      }
    }

    df = filters[ns];
    if (df) {
      dfe = df[element];
      if (dfe && (dfe[attribute] || dfe['*'])) {
        return true;
      }
    }

    return false;
  };
}
