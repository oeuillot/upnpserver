/*jslint node: true, plusplus: true, nomen: true, vars: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:db:nedb');
const os = require('os');
const Path = require('path');
const Util = require('util');
const mkdirp = require('mkdirp');
const Async = require('async');
const Datastore = require('nedb');

const logger = require('../logger');
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

    var path = Path.join(os.homedir(), "upnpserver-nodes.nedb");
    path = Path.normalize(path);

    var path2 = Path.join(os.homedir(), "upnpserver-metas.nedb");
    path2 = Path.normalize(path2);

    this._loadNodesDb(path, (error, db) => {
      if (error) {
        logger.error("Can not load nodesDb ",path2, error);
        return callback(error);
      }

      this._nodesCollection = db;

      this._loadMetasDb(path2, (error, db) => {
        if (error) {
          logger.error("Can not load metasDb ",path2, error);
          return callback(error);
        }
        debug("NeDbRegistry engine initialized");

        this._metasCollection = db;

        super.initialize(service, callback);
      });      
    });
  }

  _loadNodesDb(path, callback) {

    debug("NodesDb path=", path);

    var db = new Datastore({
      filename : path
    });

    db.loadDatabase((error) => {
      if (error) {
        return callback(error);
      }

      db.ensureIndex({
        fieldName : "id",
        unique : true

      }, (error) => {
        if (error) {
          logger.error(error);

          return callback(error);
        }

        db.ensureIndex({
          fieldName : "contentURL",
          unique : true,
          sparse: true

        }, (error) => {
          if (error) {
            logger.error(error);

            return callback(error);
          }

          callback(error, db);
        });
      });
    }); 
  }

  _loadMetasDb(path, callback) {

    debug("MetasDb path=", path);

    var db = new Datastore({
      filename : path
    });

    db.loadDatabase((error) => {
      if (error) {
        return callback(error);
      }

      db.ensureIndex({
        fieldName : "path",
        unique : true

      }, (error) => {
        if (error) {
          logger.error(error);
        }

        callback(error, db);
      });
    }); 
  }

  saveNode(node, modifiedProperties, callback) {

    node._take("db", () => {

      super.saveNode(node, modifiedProperties,
          (error) => {
            if (error) {
              logger.error("Can not save node", error);

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

  /**
   * 
   */
  _dbStore(node, modifiedProperties, callback) {
    var json = node.toJSONObject();
    if (debug.enabled) {
      debug("SaveNode id=#", node.id, "storageId=", node.$id, "data=", Util
          .inspect(json, {
            depth : null
          }));
    }
   
    if (node.$id) {
      json._id=node.$id;
      
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
            logger.error("dbStore: Can not update node #", json._id, error,
                error.stack);
            return callback(error);
          }       

          debug("dbStore: modified properties node #", node.id, "storageId=", node.$id);

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
          logger.error("dbStore: Can not update node #", node.id, "storage #",node.$id,"error=",error);
          return callback(error);
        }

        debug("dbStore: stored node #", node.id, "storageId=", json._id);

        callback(null, node);
      });
      return;
    }

    debug("Inserting node #", node.id, "storageId=", json._id);

    if (node.id) { // Not the root '0'
      json._id = node.id;    
    }
    
    this._nodesCollection.insert(json, (error, insertedDocument) => {
      if (error) {
        logger.error("Can not inserting ",json,"error=",error);
        return callback(error);
      }

      debug("Node inserted #", insertedDocument.id, "storageId=", insertedDocument._id);
      node.$id = insertedDocument._id;

      callback(null, node);
    });
  }

  /**
   * 
   */
  keyFromString(key) {
    if (key==="0") {
      return 0;
    }
    return key;
  }

  
  /**
   * 
   */
  getNodeById(id, callback) {
    if (id === 0 && this._service.root) {
      return callback(null, this._service.root);
    }

    var superSaveNode=super.saveNode;

    super.getNodeById(id, (error, node) => {
      if (error) {
        logger.error(error);
        return callback(error);
      }
      if (node) {
        setImmediate(callback.bind(this, null, node));
        return;
      }

      debug("getNodebyId #", id);

      this._nodesCollection.findOne({
        id : id

      }, (error, document) => {
        if (error) {
          logger.error(error);
          return callback(error);
        }

        debug("Find by id #", id, "=>", document);

        if (!document) {
          return callback();
        }

        node = Node.fromJSONObject(this._service, document);
        node.$id = document._id;

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

      if (!node.$id) {
        return callback();
      }

      this._nodesCollection.remove({
        _id : node.$id

      }, (error, removedNode) => {
        if (error) {
          logger.error("Can not unregister node", error);
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

    node._take("db", () => {
  
      this._dbStore(node, null, (error) => {
        node._leave("db");
        
        if (error) {
          logger.error(error);
        }
  
        debug("saveWorker STORED #", node.id);
  
        callback(error);
      });
    });
  }

  getMetas(path, mtime, callback) {

    this._metasCollection.findOne({
      path : path

    }, (error, document) => {
      if (error) {
        logger.error(error);
        return callback(error);
      }

      if (!document) {
        return callback();
      }
      
      if (document.mtime && document.mtime<mtime) {
        // TODO Remove old ?
        return callback();
      }

      callback(null, document.metas || {});
    });
  }

  putMetas(path, mtime, metas, callback) {

    this._metasCollection.update({
      path : path

    }, {
      path: path,
      mtime: mtime,
      metas: metas 

    }, {
      upsert : true,
      multi : false

    }, (error) => {
      if (error) {
        logger.error("putMetas: Can not save metas path="+path, error,
            error.stack);
        return callback(error);
      }       

      debug("putMetas: save metas of path=", path);

      callback(null);
    });
  }
}

module.exports = NeDbRegistry;
