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

  /**
   * 
   */
  initialize(service, callback) {
    this._service = service;

    var now=Date.now();
    this.initializeDb((error) => {
      if (error) {
        return callback(error);
      }

      var dt=Date.now()-now;

      if (dt>1500) {
        dt=Math.floor(dt/1000);
        logger.info("Database loaded in "+dt+" second"+((dt>1)?"s":""));

      } else {
        logger.info("Database loaded in "+dt+" ms");
      }

      super.initialize(service, callback);
    });
  }

  /**
   * 
   */
  initializeDb(callback) {    
    var path = Path.join(os.homedir(), "upnpserver-nodes.nedb");
    path = Path.normalize(path);

    var path2 = Path.join(os.homedir(), "upnpserver-metas.nedb");
    path2 = Path.normalize(path2);


    debug("NodesDb path=", path);

    var db = new Datastore({
      filename : path
    });

    db.loadDatabase((error) => {
      if (error) {
        logger.error("Can not load nodesDb ",path2, error);
        return callback(error);
      }

      this._configureNodesDb(db, (error) => {
        if (error) {
          return callback(error);
        }
        this._nodesCollection = db;

        debug("MetasDb path=", path);

        var db2 = new Datastore({
          filename : path2
        });

        db2.loadDatabase((error) => {
          if (error) {
            return callback(error);
          }

          this._configureMetasDb(db2, (error) => {
            if (error) {
              return callback(error);
            }

            this._metasCollection=db2;

            callback();
          });
        }); 
      });
    });
  }

  /**
   * 
   */
  _ensureIndexes(collection, fields, callback) {
    Async.eachSeries(fields, (f, callback) => collection.ensureIndex(f, callback), callback); 
  }

  /**
   * 
   */
  _configureNodesDb(collection, callback) {

    this._ensureIndexes(collection, [{
      fieldName : "id",
      unique : true,
      sparse: true

    }, {
      fieldName : "parentId",
      unique: false,
      sparse: true

    }, {
      fieldName : "refId",
      unique: false,
      sparse: true

    }], callback);
  }

  /**
   * 
   */
  _configureMetasDb(collection, callback) {

    this._ensureIndexes(collection, [{
      fieldName : "path",
      unique : true,
      sparse: false

    }], callback);    
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {

    node.takeLock("db", () => {

      super.saveNode(node, modifiedProperties,
          (error) => {
            if (error) {
              logger.error("Can not save node", error);

              node.leaveLock("db");
              return callback(error);
            }

            if (ASYNC_SAVE) {
              node.leaveLock("db");

              debug("Async save node #", node.id, "already=",
                  this._saveKeys[node.id]);
              this._saveKeys[node.id] = true;
              return callback(null, node);
            }

            this._dbStore(node, modifiedProperties, (error, storedNode) => {
              node.leaveLock("db");

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

    if (json.id!==0) {
      delete json.id;
    }
    delete json.childrenIds;
    delete json.linkedIds;
    if (modifiedProperties) {
      delete modifiedProperties.childrenIds;
      delete modifiedProperties.linkedIds;

      if (modifiedProperties.$push) {
        delete modifiedProperties.$push.childrenIds;
        delete modifiedProperties.$push.linkedIds;

        if (!Object.keys(modifiedProperties.$push).length) {
          delete modifiedProperties.$push;
        }
      }
    }

    if (node.$id) {
      json._id=node.$id;

      if (modifiedProperties) {
        debug("dbStore: ModifiedProperties=",modifiedProperties);

        if (!Object.keys(modifiedProperties).length) {
          debug("dbStore: nothing to modify !");

          return callback(null, node);
        }

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
     
      var id=json._id;
      delete json._id;

      this._nodesCollection.update({
        _id : id

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
      node.$id = insertedDocument._id || json._id;

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

    var super__saveNode=super.saveNode;

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

      var criteria;
      if (id===0) {
        criteria={id: id};

      } else {
        criteria={_id: id};
      }

      this._nodesCollection.findOne(criteria, (error, document) => {
        if (error) {
          logger.error("Can not get document #",id,error);
          return callback(error);
        }

        debug("Find by id #", id, "=>", document);

        if (!document) {
          return callback();
        }

        if (document.parentId===undefined) {
          logger.error("Document",document,"has not parent !");
          callback(new Error("Node #"+id+" has no parent !"));
          return;
        }
        document.id=id;

        node = Node.fromJSONObject(this._service, document);
        node.$id = document._id;

        if (node.isContainer) {
          // By upnp design a container can not be linked 
          this._nodesCollection.find( { parentId: id }, { _id: 1, x: 1 }, (error, docs) => {
            debug("Find children by parentId #",id,"=>", docs, "error=",error);
            if (error) {
              logger.error(error);
              return callback(error);
            }

            if (docs.length) {
              node.childrenIds=docs.map((doc) => doc._id);
            }

            super__saveNode.call(this, node, null, callback);
          });
          return;
        }

        this._nodesCollection.find( { refId: id }, { _id: 1, x: 1 }, (error, docs) => {
          debug("Find linked by node #",id,"=>", docs, "error=",error);
          if (error) {
            logger.error(error);
            return callback(error);
          }

          if (docs.length) {
            node.linkedIds=docs.map((doc) => doc._id);
          }

          super__saveNode.call(this, node, null, callback);
        });
      });
    });
  }

  allocateNodeId(callback) {
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

    node.takeLock("db", () => {

      this._dbStore(node, null, (error) => {
        node.leaveLock("db");

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
