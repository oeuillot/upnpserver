/*jslint node: true, plusplus: true, nomen: true, vars: true, esversion: 6 */
"use strict";

const assert = require('assert');
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

    var path3 = Path.join(os.homedir(), "upnpserver-repositories.nedb");
    path3 = Path.normalize(path3);


    debug("initializeDb", "NodesDb path=", path);

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

        debug("initializeDb", "MetasDb path=", path2);

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


            debug("initializeDb", "RepositoriesDb path=", path3);

            var db3 = new Datastore({
              filename : path3
            });

            db3.loadDatabase((error) => {
              if (error) {
                return callback(error);
              }

              this._configureRepositoriesDb(db3, (error) => {
                if (error) {
                  return callback(error);
                }

                this._repositoriesCollection=db3;

                callback();
              });
            });
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
  _configureRepositoriesDb(collection, callback) {

    this._ensureIndexes(collection, [{
      fieldName : "hashKey",
      unique : true,
      sparse: false

    }], callback);    
  }

  /**
   * 
   */
  saveNode(node, modifiedProperties, callback) {
    assert(node instanceof Node, "Invalid node parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");

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

              debug("saveNode", "Async save node #", node.id, "already=", this._saveKeys[node.id]);
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
      debug("_dbStore", "SaveNode id=#", node.id, "storageId=", node.$id, "data=", Util
          .inspect(json, {
            depth : null
          }), "modifiedProperties=", modifiedProperties);
    }

    if (!this.$rootId && node.id===0 && node.$id) {
      this.$rootId=node.$id;
    }

    delete json.childrenIds;
    delete json.linkedIds;
    if (modifiedProperties) {
      delete modifiedProperties.childrenIds;
      delete modifiedProperties.linkedIds;

      let $push=modifiedProperties.$push;
      if ($push) {
        delete $push.childrenIds;
        delete $push.linkedIds;

        if (!Object.keys(modifiedProperties.$push).length) {
          delete modifiedProperties.$push;
        }
      }

      let $pull=modifiedProperties.$pull;
      if ($pull) {
        delete $pull.childrenIds;
        delete $pull.linkedIds;

        if (!Object.keys(modifiedProperties.$pull).length) {
          delete modifiedProperties.$pull;
        }
      }

      if (modifiedProperties.parentId===-1) {
        // Never happen (the root node which would change its parent !)
        delete modifiedProperties.parentId;
      }
    }

    if (modifiedProperties) {

      if (!Object.keys(modifiedProperties).length) {
        debug("_dbStore", "nothing to modify !");

        return callback(null, node);
      }

      if (modifiedProperties.parentId!==undefined) {
        modifiedProperties.parentId=this._convertIdToObjectID(modifiedProperties.parentId);
      }
      if (modifiedProperties.refId!==undefined) {
        modifiedProperties.refId=this._convertIdToObjectID(modifiedProperties.refId);
      }
      let $push=modifiedProperties.$push;
      if ($push && $push.repositories) {
        $push.repositories=$push.repositories.map((id) => this._convertIdToObjectID(id));
      }
      let $pull=modifiedProperties.$pull;
      if ($pull && $pull.repositories) {
        $pull.repositories=$pull.repositories.map((id) => this._convertIdToObjectID(id));
      }
      if (modifiedProperties.repositories) {
        modifiedProperties.repositories=modifiedProperties.repositories.map((id) => this._convertIdToObjectID(id));
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
        ms.$set[k] = modifiedProperties[k]; // Use json{} not modifiedProperties{}
      }

      debug("_dbStore", "node #", node.id, "storageId=", node.$id, "modifiedProperties=", modifiedProperties, "ms=", ms);

      this._nodesCollection.update({
        _id : node.$id

      }, ms, {
        upsert : false,
        multi : false

      }, (error) => {
        if (error) {
          logger.error("dbStore: Can not update node #", json._id, error,
              error.stack);
          return callback(error);
        }       

        debug("_dbStore", "modified properties node #", node.id, "storageId=", node.$id);

        callback(null, node);
      });
      return;
    }

    if (json.id!==0) {
      delete json.id;
    }

    if (json.parentId===-1) {
      delete json.parentId;

    } else if (json.parentId!==undefined) {
      json.parentId=this._convertIdToObjectID(json.parentId);
    }
    if (json.refId!==undefined) {
      json.refId=this._convertIdToObjectID(json.refId);
    }
    if (json.repositories) {
      json.repositories=json.repositories.map((id) => this._convertIdToObjectID(id, true));
    }

    this._nodesCollection.update({
      _id : node.$id

    }, {
      $set : json

    }, {
      upsert : true,
      multi : false

    }, (error) => {
      if (error) {
        logger.error("dbStore: Can not update node #", node.id, "storage #",node.$id,"error=",error);
        return callback(error);
      }

      debug("_dbStore", "stored node #", node.id, "storageId=", node.$id);

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
  _convertIdToObjectID(id, cache) {
    if (id===0) {
      return this.$rootId;
    }
    return id;
  }

  /**
   * 
   */
  _convertObjectIDToId(id, cache) {
    if (this.$rootId===id) {
      return 0;
    }
    return id;
  }

  /**
   * 
   */
  getNodeById(id, callback) {
    assert(id!==undefined && id!==null, "Invalid id parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");

    if (id === 0 && this._service.root) {
      return callback(null, this._service.root);
    }

    super.getNodeById(id, (error, node) => {
      if (error) {
        logger.error(error);
        return callback(error);
      }
      if (node) {
        setImmediate(callback.bind(this, null, node));
        return;
      }

      debug("getNodeById", "search #", id);

      var criteria;
      if (id===0) {
        criteria={id: id};

      } else {
        criteria={_id: this._convertIdToObjectID(id)};
      }

      this._nodesCollection.findOne(criteria, (error, document) => {
        if (error) {
          logger.error("Can not get document #",id,error);
          return callback(error);
        }

        debug("getNodeById", "Find by id #", id, "=>", document);

        if (!document) {
          return callback();
        }

        if (document.id===0) {
          document.parentId=-1;

        } else if (document.parentId===undefined) {
          logger.error("Document",document,"has not parent !");
          callback(new Error("Node #"+id+" has no parent !"));
          return;
        }

        var objectID=document._id;
        if (document.id===undefined) {
          document.id=this._convertObjectIDToId(objectID);
        }

        if (!this.$rootId && id===0) {
          this.$rootId=objectID;
        }
        if (document.repositories) {
          document.repositories=document.repositories.map((id) => this._convertObjectIDToId(id, true));
        }

        node = Node.fromJSONObject(this._service, document);
        node.$id = objectID;
//      debug(" node=>", node);

        this._fillChildrenAndLinkIds(node, objectID, callback);
      });
    });
  }

  /**
   * Internal USE: Needed by mongodb
   */
  _saveNode(node, modifiedProperties, callback) {
    super.saveNode(node, modifiedProperties, callback);
  }

  /**
   * 
   */
  _fillChildrenAndLinkIds(node, objectID, callback) {

    // Bug in nedb, we must specify another field _id in the projection
    this._nodesCollection.find( { parentId: objectID }, { _id: 1, x: 1 }, (error, docs) => {
      debug("_fillChildrenAndLinkIds", "Find children by parentId #",objectID,"=>", docs, "error=",error);
      if (error) {
        logger.error(error);
        return callback(error);
      }

      if (docs.length) {
        node.childrenIds=docs.map((doc) => this._convertObjectIDToId(doc._id));
      }

      this._nodesCollection.find( { refId: objectID }, { _id: 1, x: 1 }, (error, docs) => {
        debug("_fillChildrenAndLinkIds", "Find linked by node #",objectID,"=>", docs, "error=",error);
        if (error) {
          logger.error(error);
          return callback(error);
        }

        if (docs.length) {
          node.linkedIds=docs.map((doc) => this._convertObjectIDToId(doc._id));
        }

        this._saveNode(node, null, callback);
      });
    });
  }


  /**
   * 
   */
  allocateNodeId(node, callback) {
    assert(node instanceof Node, "Invalid node parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");

    var id = this._nodesCollection.createNewId();

    node.$id=id;
    node._id=this._convertObjectIDToId(id);

    debug("allocateNodeId", "Allocated id=", id);

    callback();
  }

  /**
   * 
   */
  unregisterNode(node, callback) {
    assert(node instanceof Node, "Invalid node parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");

    debug("unregisterNode", "Unregister node #",node);
    super.unregisterNode(node, (error) => {
      if (error) {
        return callback(error);
      }

      if (!node.$id) {
        logger.error("Can not unregister node #"+node.id);
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
    debug("_garbageNodeAsync", "garbageNode #", node.id, "state=", this._saveKeys[node.id]);
    if (!this._saveKeys[node.id]) {
      return;
    }
    this._saveQueue.push(node);
  }

  _saveWorker(node, callback) {
    if (debug.enabled) {
      debug("_saveWorker", "saveWorker #", node.id, "state=", this._saveKeys[node.id]);
    }
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

        debug("_saveWorker", "STORED #", node.id);

        callback(error);
      });
    });
  }

  /**
   * 
   */
  getMetas(path, mtime, callback) {
    assert(typeof(path)==="string", "Invalid path parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");
    assert(typeof(mtime)==="number", "Invalid metas parameter");

    debug("getMetas", "Get metas for path=",path,"mtime=",mtime);
 
    this._metasCollection.findOne({
      path : path

    }, (error, document) => {
      if (error) {
        logger.error(error);
        return callback(error);
      }

      if (!document) {
        debug("getMetas", "No metas for path=",path);
        return callback();
      }

      if (document.mtime && document.mtime<mtime) {
        // TODO Remove old ?
        
        debug("getMetas", "Metas outdated for path=",path);

        return callback();
      }

      debug("getMetas", "Metas for path=",path,"metas=",document.metas);

      callback(null, document.metas || {});
    });
  }

  /**
   * 
   */
  putMetas(path, mtime, metas, callback) {
    assert(typeof(path)==="string", "Invalid path parameter");
    assert(typeof(mtime)==="number", "Invalid metas parameter");
    assert(typeof(metas)==="object", "Invalid metas parameter");
    assert(typeof(callback)==="function", "Invalid function parameter");

    debug("putMetas", "Put metas of path=",path,"mtimer=",mtime,"metas=",metas);
    
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

      debug("putMetas", "Metas saved");

      callback(null);
    });
  }

  registerRepository(repository, repositoryHashKey, callback) {
    var repo={
        hashKey: repositoryHashKey
    };

    this._repositoriesCollection.findOne(repo, (error, document) => {
      if (error) {
        logger.error("Can not get repository repo=", repo, error);
        return callback(error);
      }

      if (document) {        
        repository.$id=document._id;
        repository._id=this._convertObjectIDToId(document._id);

        debug("Found repository #", repository._id, "hashKey=",repo);

        return callback(null, repository);
      }

      this._repositoriesCollection.insert(repo, (error, document) => {
        if (error) {
          logger.error("Can not insert new repository repo=", repo, error);
          return callback(error);
        }

        repository.$id=document._id;
        repository._id=this._convertObjectIDToId(document._id);

        debug("Register repository #", repository.id, "hashKey=",repo);

        callback(null, repository);        
      });
    });
  }
}

module.exports = NeDbRegistry;
