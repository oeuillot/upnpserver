/*jslint node: true, plusplus: true, nomen: true, vars: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:db:nedb');
const os = require('os');
const Path = require('path');
const Util = require('util');
const mkdirp = require('mkdirp');
const Async = require('async');

const CachedRegistry = require('./cachedRegistry');
const Node = require('../node');

const ASYNC_SAVE = false;
const SAVE_QUEUE_CONCURRENCY = 2;

class NeDbRegistry extends CachedRegistry {
  constructor() {
    super();

    if (ASYNC_SAVE) {
      this._saveQueue = Async.queue(this._saveWorker.bind(this),
          SAVE_QUEUE_CONCURRENCY);
      this._saveKeys = {};
      this._garbageNode=this._garbageNodeAsync;
    }
  }

  initialize(service, callback) {
    this._service = service;

    var Datastore = require('NeDb');

    var path = Path.join(os.homedir(), "upnpserver.nedb");

    path = Path.normalize(path);

    debug("NeDb path=", path);

    var db = new Datastore({
      filename : path
    });

    db.loadDatabase((error) => {
      if (error) {
        return callback(error);
      }
      this._db = db;

      var nodesCollection = db;
      this._nodesCollection = nodesCollection;

      nodesCollection.ensureIndex({
        fieldName : "id",
        unique : true
      }, (error) => {
        if (error) {
          console.error(error);
        }

        debug("NeDbRegistry initialized");

        super.initialize(service, callback);
      });
    });
  }

  saveNode(node, modifiedProperties, callback) {

    node._take("db", () => {

      super.saveNode(node, modifiedProperties,
          (error) => {
            if (error) {
              console.error("Can not save node", error);

              node._leave("db");
              return callback(error);
            }

            if (ASYNC_SAVE) {
              node._leave("db");

              debug("Async save node #", node.id, "already=",
                  this._saveKeys[node.id]);
              this._saveKeys[node.id] = true;
              return callback(null, node);
            }

            this._dbStore(node, modifiedProperties, (error, storedNode) => {
              node._leave("db");

              callback(error, storedNode);
            });
          });
    });
  }

  _dbStore(node, modifiedProperties, callback) {
    var json = node.toJSONObject();

    if (debug.enabled) {
      debug("SaveNode id=#", node.id, "storageId=", node._id, "data=", Util
          .inspect(json, {
            depth : null
          }));
    }

    if (node._id !== undefined) {
      json._id = node._id;

      if (modifiedProperties) {

        var ms = {};
        for ( var k in modifiedProperties) {
          if (k.charAt(0) === '$') {
            ms[k] = modifiedProperties[k];
            continue;
          }
          if (!ms.$set) {
            ms.$set = {};
          }
          ms.$set[k] = modifiedProperties[k];
        }

        debug("dbStore node #", node.id, "storageId=", json._id,
            "modifiedProperties=", modifiedProperties, "ms=", ms);

        this._nodesCollection.update({
          _id : json._id

        }, ms, {
          upsert : false,
          multi : false

        }, (error) => {
          if (error) {
            console.error("dbStore: Can not update node #", json._id, error,
                error.stack);
            return callback(error);
          }       

          debug("dbStore: modified properties node #", node.id, "storageId=",
              node._id);

          callback(null, node);
        });
        return;
      }

      this._nodesCollection.update({
        _id : json._id

      }, {
        $set : json

      }, {
        upsert : false,
        multi : false

      }, (error) => {
        if (error) {
          console.error("dbStore: Can not update node #", node.id, error);
          return callback(error);
        }

        debug("dbStore: stored node #", node.id, "storageId=", node._id);

        callback(null, node);
      });
      return;
    }

    debug("Inserting node #", node.id, "storageId=", node._id);

    json._id = node.id;

    this._nodesCollection.insert(json, (error, insertedDocument) => {
      if (error) {
        console.error(error);
        return callback(error);
      }

      debug("Node inserted #", insertedDocument.id, "storageId=",
          insertedDocument._id);
      node._id = insertedDocument._id;

      callback(null, node);
    });
  }

  getNodeById(id, callback) {
    if (id === 0 && this._service.root) {
      return callback(null, this._service.root);
    }

    debug("getNodebyId #", id);
    var superSaveNode=super.saveNode;

    super.getNodeById(id, (error, node) => {
      if (error) {
        console.error(error);
        return callback(error);
      }
      if (node) {
        setImmediate(callback.bind(this, null, node));
        return;
      }

      this._nodesCollection.findOne({
        id : id

      }, (error, document) => {
        if (error) {
          console.error(error);
          return callback(error);
        }

        debug("Find by id #", id, "=>", document);

        if (!document) {
          return callback();
        }

        node = Node.fromJSONObject(this._service, document);
        node._id = id;

        superSaveNode.call(this, node, null, callback);
      });
    });
  }

  allocateNodeId(callback) {
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
  }

  unregisterNode(node, callback) {
    super.unregisterNode(node, (error) => {
      if (error) {
        return callback(error);
      }

      if (!node._id) {
        return callback();
      }

      this._nodesCollection.remove({
        _id : node._id

      }, (error, removedNode) => {
        if (error) {
          console.error("Can not unregister node", error);
          return callback(error);
        }

        callback();
      });
    });
  }

  _garbageNodeAsync(node) {
    debug("garbageNode #", node.id, "state=", this._saveKeys[node.id]);
    if (!this._saveKeys[node.id]) {
      return;
    }
    this._saveQueue.push(node);
  }

  _saveWorker(node, callback) {
    debug("saveWorker #", node.id, "state=", this._saveKeys[node.id]);
    if (!this._saveKeys[node.id]) {
      return;
    }
    delete this._saveKeys[node.id];

    this._dbStore(node, null, (error) => {
      if (error) {
        console.error(error);
      }

      debug("saveWorker STORED #", node.id);

      callback(error);
    });
  }
}

module.exports = NeDbRegistry;
