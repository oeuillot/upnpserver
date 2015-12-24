/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var CachedRegistry = require('./cachedRegistry');
var debug = require('debug')('upnpserver:db:nedb');
var os = require('os');
var Path = require('path');
var Util = require('util');
var Node = require('../node');
var mkdirp = require('mkdirp');

var NeDbRegistry = function() {
  this._locksById = {};
};

Util.inherits(NeDbRegistry, CachedRegistry);

module.exports = NeDbRegistry;

NeDbRegistry.prototype.initialize = function(service, callback) {
  this._service = service;

  var Datastore = require('NeDb');

  var path = Path.join(os.homedir(), "upnpserver.nedb");

  path = Path.normalize(path);

  debug("NeDb path=", path);

  var self = this;

  var db = new Datastore({
    filename : path
  });

  db.loadDatabase(function(error) {
    if (error) {
      return callback(error);
    }
    self._db = db;

    var nodesCollection = db;
    self._nodesCollection = nodesCollection;

    nodesCollection.ensureIndex({
      fieldName : "id",
      unique : true
    }, function(error) {
      if (error) {
        console.error(error);
      }

      debug("NeDbRegistry initialized");

      CachedRegistry.prototype.initialize.call(self, service, callback);
    });
  });
};

NeDbRegistry.prototype.saveNode = function(node, modifiedProperties, callback) {
  var self = this;

  node._take("db", function() {

    CachedRegistry.prototype.saveNode.call(self, node, modifiedProperties,
        function(error) {
          if (error) {
            console.error("Can not save node", error);

            node._leave("db");
            return callback(error);
          }

          var json = node.toJSONObject();

          if (debug.enabled) {
            debug("SaveNode id=#", node.id, "storageId=", node._id, "data=",
                Util.inspect(json, {
                  depth : null
                }));
          }

          if (node._id !== undefined) {
            json._id = node._id;

            if (modifiedProperties) {
              debug("Update node #", node.id, "storageId=", json._id,
                  "modifiedProperties=", modifiedProperties);

              self._nodesCollection.update({
                _id : json._id

              }, {
                $set : modifiedProperties

              }, {
                upsert : false,
                multi : false

              }, function(error) {
                if (error) {
                  console.error("Can not update node #", json._id, error,
                      error.stack);
                  node._leave("db");
                  return callback(error);
                }

                debug("Updated modified properties node #", node.id,
                    "storageId=", node._id);

                node._leave("db");
                callback(null, node);
              });
              return;
            }

            self._nodesCollection.update({
              _id : json._id

            }, {
              $set : json

            }, {
              upsert : false,
              multi : false

            }, function(error) {
              if (error) {
                console.error("Can not register node", error);
                node._leave("db");
                return callback(error);
              }

              debug("Saved node #", node.id, "storageId=", node._id);

              node._leave("db");
              callback(null, node);
            });
            return;
          }

          debug("Inserting node #", node.id, "storageId=", node._id);

          json._id = node.id;

          self._nodesCollection.insert(json, function(error, insertedDocument) {
            if (error) {
              console.error(error);
              node._leave("db");
              return callback(error);
            }

            debug("Inserted node #", insertedDocument.id, "storageId=",
                insertedDocument._id);
            node._id = insertedDocument._id;

            node._leave("db");
            callback(null, node);
          });
        });
  });
};

NeDbRegistry.prototype.getNodeById = function(id, callback) {
  var self = this;
  CachedRegistry.prototype.getNodeById.call(this, id, function(error, node) {
    if (error) {
      console.error(error);
      return callback(error);
    }
    if (node) {
      return callback(null, node);
    }

    self._nodesCollection.findOne({
      id : id

    }, function(error, document) {
      if (error) {
        console.error(error);
        return callback(error);
      }

      debug("Find by id #", id, "=>", document);

      if (!document) {
        return callback();
      }

      node = Node.fromJSONObject(self._service, document);
      node._id = id;

      CachedRegistry.prototype.saveNode.call(self, node, null, callback);
    });
  });
};

NeDbRegistry.prototype.allocateNodeId = function(callback) {
  var json = {};

  // debug("Request new id...");

  /*
   * this._nodesCollection.insert(json, function(error, insertedDocument) { if (error) { console.error(error); return
   * callback(error); }
   * 
   * debug("Allocated id=", insertedDocument._id);
   * 
   * callback(null, insertedDocument._id); });
   */

  var id = this._nodesCollection.createNewId();

  debug("Allocated id=", id);

  callback(null, id);
};

NeDbRegistry.prototype.unregisterNode = function(node, callback) {
  var self = this;
  CachedRegistry.prototype.unregisterNode.call(this, node, function(error) {
    if (error) {
      return callback(error);
    }

    if (!node._id) {
      return callback();
    }

    self._nodesCollection.remove({
      _id : node._id

    }, function(error, savedItem) {
      if (error) {
        console.error("Can not unregister node", error);
        return callback(error);
      }

      callback();
    });
  });
};
