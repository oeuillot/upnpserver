/*jslint node: true, esversion: 6 */
"use strict";

const Path = require('path');
const EventEmitter = require('events');

const debug = require('debug')('upnpserver:contentHandlers:metasJson');
const logger = require('../logger');

const Abstract_Metas = require('./abstract_metas');
const NodeWeakHashmap = require('../util/nodeWeakHashmap');

const METADATAS_DIRECTORY = ".metadatas";
const DIRECTORY_JSON = "_directory_.json";

const JSON_NOT_FOUND_OR_INVALID = "***INVALID***";

class MetasJson extends Abstract_Metas {
  constructor(configuration) {
    super(configuration);
    
    this._jsonCache = new NodeWeakHashmap("json", 1000*30, false);
  }

  static get METADATAS_DIRECTORY() {
    return METADATAS_DIRECTORY;
  }
  
  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {
    var contentURL = contentInfos.contentURL;
    var contentProvider = contentInfos.contentProvider;
    
    if (contentInfos.stats.isDirectory()) {
      var path = contentProvider.join(contentURL, METADATAS_DIRECTORY, DIRECTORY_JSON);
      debug("prepareMetas", "Directory: test", path, "contentURL=",contentURL);
      
      this._loadJSON(contentProvider, path, (error, json) => {
        if (error) {
          if (error.code==='ENOENT') {
            return callback();
          }

          var ex=new Error("Can not load/parse JSON '"+path+"'");
          ex.reason = error;
          ex.path = path;
          
          return callback(ex);
        }
        if (!json) {
          // No JSON
          return callback();
        }
       
        this._processFolder(contentInfos, context, path, json, (error, metas) => {
          if (error) {
            return callback(error);
          }
          
          metas=metas || {};          
          metas.jsonType='directory';
          
          callback(null, metas);
        });
      });        
      return;
    }
    
    var basename=Path.basename(contentURL);
    
    var path2 = contentProvider.join(contentURL, '..', METADATAS_DIRECTORY, basename+".json");    
     
    this._loadJSON(contentProvider, path2, (error, json) => {
      if (error) {
        if (error.code==='ENOENT') {
          return callback();
        }
        
        var ex=new Error("Can not load/parse JSON '"+path+"'");
        ex.reason = error;
        ex.path = path;
        
        return callback(ex);
      }
      if (!json) {
        // No JSON
        return callback();
      }
      
      this._processFile(contentInfos, context, path, json, (error, metas) => {
        if (error) {
          return callback(error);
        }
        
        //metas=metas || {};          
        //metas.metasType='file';
        
        callback(null, metas);
      });
    });     
  }

  _processFile(contentInfos, context, path, json, callback) {
    callback();
  }

  _processFolder(contentInfos, context, path, json, callback) {
    callback();
  }

  _loadJSONfromNode(node, callback) {
    var attributes = node.attributes;
    
    var contentURL = node.contentURL;
    var contentProvider = this.service.getContentProvider(contentURL);
    
    var p;
    if (attributes.jsonType==="directory") {
      p = contentProvider.join(contentURL, METADATAS_DIRECTORY, DIRECTORY_JSON);
      
    } else {      
      var basename=Path.basename(contentURL);      
      p = contentProvider.join(contentURL, '..', METADATAS_DIRECTORY, basename+".json");    
    }    
    
    debug("_loadJSONFromNode", "Node #",node.id," json path=",p);
      
    this._loadJSON(contentProvider, p, callback);
  }
  
  _loadJSON(contentProvider, path, callback) {
    debug("_loadJSON", "try to load",path);
    
    var json = this._jsonCache.get(path);
    if (json) {
      if (json instanceof EventEmitter) {
        debug("_loadJSON", "Wait for async result path=", path);
        
        json.on('result', (json) => callback(null, json));
        json.on('problem', (error) => callback(error));
        return;
      }
      
      if (json===JSON_NOT_FOUND_OR_INVALID) {
        return callback(null, null);
      }
      
      debug("_loadJSON", "Return json from", path, "typeof json=", typeof(json));
      return callback(null, json, path, contentProvider);
    }
    
    var ev=new EventEmitter();    
    this._jsonCache.put({id: path}, ev);
    
    contentProvider.stat(path, (error, stats) => {
      if (error) {
        var ex=new Error("Can not stat '"+path+"'");
        ex.reason = error;
        ex.path=path;
        
        this._jsonCache.put({id: path}, JSON_NOT_FOUND_OR_INVALID);
        
        ev.emit('problem', ex);
        
        return callback(ex);
      }

      contentProvider.readContent(path, "utf-8", (error, content) => {
        //debug("_loadJSON", "path=",path, "JSON=",content);
        
        if (error) {
          this._jsonCache.put({id: path}, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', error);
          return callback(error);
        }

        var json;
        try {
          json = JSON.parse(content);

        } catch (x) {
          var ex=new Error("Can not parse JSON ");
          ex.reason=x;
          logger.error(ex);
          
          this._jsonCache.put({id: path}, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', ex);
          return callback(ex);
        }
        
        this._jsonCache.put({id: path}, json);

        ev.emit('result', json);

        callback(null, json, path, contentProvider);
      });      
    });
  }
}

module.exports = MetasJson;
