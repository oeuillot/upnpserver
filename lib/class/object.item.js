/*jslint node: true, vars: true, nomen: true */
"use strict";

var debug = require('debug')('upnpserver:class:object.item');

var Xmlns = require('../xmlns');

var FILEMEDATA_TIMES_LIST = [ 'modifiedTime', 'changeTime', 'accessTime',
    'birthTime' ];

var Item = function() {
};

module.exports = Item;

Item.UPNP_CLASS = "object.item";
Item.prototype.name = Item.UPNP_CLASS;

Item.prototype.prepareNode = function(node, callback) {

  return callback();
};

Item.prototype.toJXML = function(node, attributes, request, filterCallback,
    callback) {

  var content = (node.attrs) ? node.attrs.slice(0) : [];

  var xml = {
    _name : "item",
    _attrs : {
      id : node.id,
      parentID : node.parentId,
      restricted : (attributes.restricted === false) ? "0" : "1"
    },
    _content : content
  };

  if (attributes.searchable !== undefined) {
    xml._attrs.searchable = (attributes.searchable) ? "1" : "0";
  }

  var scs = attributes.searchClasses;
  if (attributes.searchable && scs) {
    scs.forEach(function(sc) {
      content.push({
        _name : "upnp:searchClass",
        _attrs : {
          includeDerived : (sc.includeDerived ? "1" : "0")
        },
        _content : sc.name
      });
    });
  }

  if (filterCallback(Xmlns.PURL_ELEMENT, "title")) {
    var title = attributes.title;

    content.push({
      _name : "dc:title",
      _content : title || node.name
    });
  }

  if (node.upnpClass) {
    content.push({
      _name : "upnp:class",
      _content : node.upnpClass.name
    });
  }

  if (filterCallback(Xmlns.PURL_ELEMENT, "date")) {
    if (attributes.year) {
      content.push({
        _name : "dc:date",
        _content : Item.toISODate(Date.UTC(attributes.year, 0))
      });

    } else if (attributes.date) {
      content.push({
        _name : "dc:date",
        _content : Item.toISODate(attributes.date)
      });
    }
  }

  if (request.contentDirectoryService.jasminFileMetadatasExtension) {
    _addFileTimes(xml, attributes, filterCallback);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "artist")) {
    Item.addList(content, attributes.artists, "upnp:artist", true);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "actor")) {
    Item.addList(content, attributes.actors, "upnp:actor", true);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "author")) {
    Item.addList(content, attributes.authors, "upnp:author", true);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "producer")) {
    Item.addList(content, attributes.producers, "upnp:producer", false);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "director")) {
    Item.addList(content, attributes.directors, "upnp:director", false);
  }

  if (filterCallback(Xmlns.PURL_ELEMENT, "publisher")) {
    Item.addList(content, attributes.publishers, "dc:publisher", false);
  }

  if (filterCallback(Xmlns.PURL_ELEMENT, "contributor")) {
    Item.addList(content, attributes.contributors, "dc:contributor", false);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "rating")) {
    _addRatings(content, attributes.ratings);
  }

  if (filterCallback(Xmlns.UPNP_METADATA, "genre")) {
    _addGenres(content, attributes.genres);
  }

  return callback(null, xml);
};

Item.prototype.processRequest = function(node, request, response, path,
    parameters, callback) {

  var contentHandlerKey = parameters.contentHandler;
  if (contentHandlerKey !== undefined) {
    var contentHandler = node.service.contentHandlersById[contentHandlerKey];

    if (debug.enabled) {
      debug("Process request: contentHandler key=", contentHandlerKey); // , " handler=",contentHandler);
    }

    if (!contentHandler) {
      response
          .writeHead(404, 'Content handler not found: ' + contentHandlerKey);
      response.end();
      return callback(null, true);
    }

    contentHandler.processRequest(node, request, response, path, parameters,
        callback);
    return;
  }

  callback(null, false);
};

Item._getNode = function(node, name, create) {
  var content = node._content;
  for (var i = 0; i < content.length; i++) {
    if (content[i]._name === name) {
      return content[i];
    }
  }

  if (create === false) {
    return null;
  }

  var n = {
    _name : name
  };
  content.push(n);

  return n;
};

Item.toISODate = function(date) {
  if (typeof (date) === "number") {
    date = new Date(date);
  }
  return date.toISOString().replace(/\..+/, '');
};

Item.prototype.toString = function() {
  return "[UpnpClass " + this.name + "]";
};

Item.addNamespaceURI = function(xml, prefix, uri) {
  var attrs = xml._attrs;
  if (attrs) {
    for ( var name in attrs) {
      var ret = /xmlns(:[a-z0-9])?/i.exec(name);
      if (!ret) {
        continue;
      }

      var p = (ret[1] && ret[1].slice(1)) || "";
      if ((p || prefix) && (p !== prefix)) {
        continue;
      }

      var value = attrs[name];

      if (value !== uri) {
        throw new Error("XMLNS conflict " + value + " <> " + uri +
            " for same prefix '" + p + "'");
      }
      return;
    }
  }
  if (!attrs) {
    attrs = {};
    xml._attrs = attrs;
  }

  attrs["xmlns" + (prefix ? (":" + prefix) : "")] = uri;
};

function _addGenres(content, list) {
  if (!list || !list.length) {
    return;
  }

  list.forEach(function(genre) {
    if (!genre) {
      return;
    }

    if (typeof (genre) === "object") {
      var a = {
        _name : "upnp:genre",
        _content : genre.name
      };

      if (genre.id) {
        a._attrs = {
          id : genre.id
        };

        if (genre.extended) {
          a._attrs.extended = genre.extended;
        }
      }

      content.push(a);
      return;
    }

    content.push({
      _name : "upnp:genre",
      _content : genre
    });
  });
}

function _addRatings(content, list) {
  if (!list || !list.length) {
    return;
  }

  list.forEach(function(rating) {
    if (!rating) {
      return;
    }
    var a = {
      _name : "upnp:rating",
      _content : rating.rating
    };

    if (rating.type) {
      a._attrs = a._attrs || {};
      a._attrs.type = rating.type;
    }

    if (rating.advice) {
      a._attrs = a._attrs || {};
      a._attrs.advice = rating.advice;
    }

    if (rating.equivalentAge) {
      a._attrs = a._attrs || {};
      a._attrs.advice = rating.equivalentAge;
    }

    // console.log("Add rating ", a);
    content.push(a);
  });
}
Item.addList = function(content, list, name, hasRole) {
  if (!list || !list.length) {
    return;
  }

  list.forEach(function(item) {
    if (!item) {
      return;
    }

    if (typeof (item) === "object") {
      var a = {
        _name : name,
        _content : item.name
      };

      if (hasRole && item.role) {
        a._attrs = {
          role : item.role
        };
      }

      content.push(a);
      return;
    }

    content.push({
      _name : name,
      _content : item
    });
  });
};

function _addFileTimes(xml, attributes, filterCallback) {

  FILEMEDATA_TIMES_LIST.forEach(function(time) {
    var d = attributes[time];

    //
    if (!d) {
      return;
    }

    if (!filterCallback(Xmlns.JASMIN_FILEMETADATA, time)) {
      return;
    }

    Item.addNamespaceURI(xml, "fm", Xmlns.JASMIN_FILEMETADATA);

    xml._content.push({
      _name : "fm:" + time,
      _content : Item.toISODate(d)
    });
  });
}
