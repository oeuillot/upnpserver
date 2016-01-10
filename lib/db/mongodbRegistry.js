/*jslint node: true, plusplus: true, nomen: true, vars: true, esversion: 6 */
"use strict";

const MongoDb = require('mongodb');
const Async = require('async');
const crypto = require('crypto');

const debug = require('debug')('upnpserver:db:mongodb');
const logger = require('../logger');

const NeDbRegistry = require('./nedbRegistry');

class MongoDbRegistry extends NeDbRegistry {

  /**
   * 
   */
  initializeDb(callback) {    
    var url = process.env.MONGODB_URL; //'mongodb://localhost:27017/upnpserver';

    if (!url) {
      var error=new Error("You must specify MONGODB_URL environment variable");
      return callback(error);
    }

    debug("Connect client to url",url);

    MongoDb.MongoClient.connect(url, (error, db) => {
      if (error) {
        logger.error("Can not connect mongodb server", url, error);
        return callback(error);
      }

      debug("Mongodb connected");

      var collection = db.collection('nodes');
      this._configureNodesDb(collection, (error) => {
        debug("NodesDb",collection,error);

        if (error) {
          return callback(error);
        }
        this._nodesCollection = collection;

        var collection2 = db.collection('metas');
        this._configureMetasDb(collection2, (error) => {
          debug("MetasDb",collection2,error);
          if (error) {
            return callback(error);
          }

          this._metasCollection = collection2;

          callback();
        });
      });
    });
  }

  /**
   * 
   */
  _ensureIndexes(collection, fields, callback) {
    Async.eachSeries(fields, (f, callback) => {

      debug("Ensure Index",f);

      collection.ensureIndex(f.fieldName, {
        unique: f.unique,
        sparse: f.sparse

      }, (error) => {
        debug("Index done",error);

        callback(error);
      });

    }, (error) => {
      if (error) {
        logger.error(error);
        return callback(null, error);
      }

      debug("Indexes installed !");

      callback();
    }); 
  }

  allocateNodeId(node, callback) {
    var objectID = new MongoDb.ObjectID();

    node.$id=objectID;
    node._id=this._convertObjectIDToId(objectID);

    debug("Allocated id=", objectID);

    callback();
  }

  /**
   * 
   */
  _convertObjectIDToId(id) {
    if (this.$rootId && this.$rootId.equals(id)) {
      return 0;
    }
    return id;
  }

  /**
   * 
   */
  _convertIdToObjectID(id) {
    if (id===0) {
      return this.$rootId;
    }
    return new MongoDb.ObjectID(id);
  }


  /**
   * 
   */
  _fillChildrenAndLinkIds(node, objectID, callback) {

    this._nodesCollection.find( { parentId: objectID }).project({ _id: 1 }).toArray((error, docs) => {
      debug("Find children by parentId #", objectID, "=>", docs, "error=", error);
      if (error) {
        logger.error(error);
        return callback(error);
      }

      if (docs.length) {
        node.childrenIds=docs.map((doc) => this._convertObjectIDToId(doc._id));
      }
      debug("Node.childrenIds #", objectID, "=>", node.childrenIds);

      this._nodesCollection.find( { refId: objectID }).project({ _id: 1}).toArray((error, docs) => {
        debug("Find linked by node #", objectID, "=>", docs, "error=", error);
        if (error) {
          logger.error(error);
          return callback(error);
        }

        if (docs.length) {
          node.linkedIds=docs.map((doc) => this._convertObjectIDToId(doc._id));
        }
        debug("Node.linkedIds #", objectID, "=>", node.linkedIds);

        this._saveNode(node, null, callback);
      });
    });
  }

}

module.exports = MongoDbRegistry;
