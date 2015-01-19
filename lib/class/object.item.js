/*jslint node: true */
"use strict";

var Item = function() {
};

Item.ITEM = "object.item";
Item.CONTAINER = "object.container";
Item.PERSON = Item.CONTAINER + ".person";
Item.GENRE = Item.CONTAINER + ".genre";
Item.STORAGE_FOLDER = Item.CONTAINER + ".storageFolder";
Item.VIDEO_ITEM = Item.ITEM + ".videoItem";
Item.IMAGE_ITEM = Item.ITEM + ".imageItem";
Item.IMAGE_PHOTO = Item.IMAGE_ITEM + ".photo";
Item.AUDIO_ITEM = Item.ITEM + ".audioItem";
Item.MUSIC_TRACK = Item.AUDIO_ITEM + ".musicTrack";
Item.MUSIC_ARTIST = Item.PERSON + ".musicArtist";
Item.ALBUM_CONTAINER = Item.CONTAINER + ".album";
Item.MUSIC_ALBUM = Item.ALBUM_CONTAINER + ".musicAlbum";
Item.VIDEO_ALBUM = Item.ALBUM_CONTAINER + ".videoAlbum";
Item.PHOTO_ALBUM = Item.ALBUM_CONTAINER + ".photoAlbum";
Item.MUSIC_GENRE = Item.GENRE + ".musicGenre";
// Playlists should be: object.container.playlistContainer
// object.container.person.movieActor
// object.container.person.musicArtist

module.exports = Item;

Item.ParentClass = null;
Item.UPNP_CLASS = "object.item";

Item.prototype.init = function(parent, name, upnpClass, container, attributes,
    callback) {
  return callback(null, name, attributes);
};

Item.prototype.toJXML = function(item, request, callback) {

  var attributes = item.attributes;

  var content = (item.attrs)
      ? item.attrs.slice(0) : [];

  var xml = {
    _name : "item",
    _attrs : {
      id : item.id,
      parentID : item.parentId,
      restricted : (attributes.restricted === false)
          ? "0" : "1"
    },
    _content : content
  };

  if (attributes.searchable !== undefined) {
    xml._attrs.searchable = (attributes.searchable)
        ? "1" : "0";
  }

  var scs = attributes.searchClasses;
  if (attributes.searchable && scs) {
    scs.forEach(function(sc) {
      content.push({
        _name : "upnp:searchClass",
        _attrs : {
          includeDerived : (sc.includeDerived
              ? "1" : "0")
        },
        _content : sc.name
      });
    });
  }

  var title = attributes.title;
  content.push({
    _name : "dc:title",
    _content : title || item.name
  });

  if (item.upnpClass) {
    content.push({
      _name : "upnp:class",
      _content : item.upnpClass
    });
  }
  var date = item.attributes.date;
  if (date) {
    if (typeof (date) === "number") {
      date = new Date(date);
    }
    content.push({
      _name : "dc:date",
      _content : Item.toISODate(date)
    });
  }

  return callback(null, xml);
};

Item.prototype.processResponse = function(item, request, response, path,
    parameters, callback) {
  return callback("Not supported");
};

Item._getNode = function(node, name) {
  var content = node._content;
  for (var i = 0; i < content.length; i++) {
    if (content[i]._name === name) {
      return content[i];
    }
  }

  var n = {
    _name : name
  };
  content.push(n);

  return n;
};

Item.toISODate = function(date) {
  return date.toISOString().replace(/\..+/, '');
};
