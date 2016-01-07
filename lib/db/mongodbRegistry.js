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

  /**
   * 
   */
  allocateNodeId(callback) {
    if (true) {
      let len=16;
      let id= crypto.randomBytes(Math.ceil(Math.max(8, len * 2))).toString('base64').replace(/[+\/]/g, '').slice(0, len);
      
      return callback(null, id);
    }
    
    var objectID = new MongoDb.ObjectID();

    var id = new Buffer(objectID.generate(), 'binary');

    id=id.toString('base64').replace(/[+\/]/g, '');

    debug("Allocated id=", id);
    
    callback(null, id);
  }
}

module.exports = MongoDbRegistry;
