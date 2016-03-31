/*jslint node: true, esversion: 6 */
"use strict";

const Path = require('path');
const EventEmitter = require('events');

const assert = require('assert');
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

    this._basePath = this._configuration.basePath;

    if (!MetasJson._jsonCache) {
      MetasJson._jsonCache = new NodeWeakHashmap("json", 1000*60, false);
    }
  }


  initialize(contentDirectoryService, callback) {

    if (this._basePath) {
      this._baseURL = contentDirectoryService.newURL(this._basePath);
    }

    super.initialize(contentDirectoryService, callback);
  }

  static get METADATAS_DIRECTORY() {
    return METADATAS_DIRECTORY;
  }

  _searchDirectoryJSONFile(contentURL, callback) {
    var jsonURL = contentURL.join(METADATAS_DIRECTORY, DIRECTORY_JSON);

    debug("_searchDirectoryJSONFile", "Directory: test", contentURL, "jsonURL=",jsonURL);    

    var directoryInfos = {type: 'directory', base: false};

    this._loadJSON(jsonURL, directoryInfos, (error, jsonContext) => {
      if (error) {
        logger.error(error);
      }
      if (jsonContext) {
        return callback(null, jsonContext, directoryInfos);
      }

      if (!this._baseURL) {
        return callback(error);
      }

      var reg=this._getKeyFromDirectoryName(contentURL.basename);
      if (!reg) {
        return callback(error);
      }

      this._computeJSONPathInBase(reg, directoryInfos, (error, jsonURL, directoryInfos) => {
        if (error || !jsonURL) {
          return callback(error);
        }

        directoryInfos.base=true;

        this._loadJSON(jsonURL, directoryInfos, (error, jsonContext) => {
          if (error) {
            return callback(error);
          }

          callback(null, jsonContext, directoryInfos);
        });
      });
    });
  }

  _searchJSONFile(contentURL, callback) {
    
    var basename=contentURL.basename;

    var jsonURL = contentURL.join('..', METADATAS_DIRECTORY, basename+".json");    

    debug("_searchJSONFile", "File: jsonURL=", jsonURL, "contentURL=",contentURL, "basename=", basename);

    var fileInfos = { type: 'file', base: false};

    var regBasename=basename.replace(/_/g,' ');
    var season;
    var episode;
    var reg=/\bS(\d{1,})[-\s]*E(\d{1,})\b/i.exec(regBasename);
    if (reg) {
      fileInfos.season = parseInt(reg[1], 10);
      fileInfos.episode = parseInt(reg[2], 10);
      fileInfos.type="tvShow";

    } else {
      reg=/\bE(\d{1,})\b/i.exec(regBasename);
      if (reg) {
        fileInfos.season = 0;
        fileInfos.episode = parseInt(reg[1], 10);
        fileInfos.type="tvShow";
      }
    }

    debug("_searchJSONFile", "File no JSON season=",season, "episode=",episode);

    this._loadJSON(jsonURL, fileInfos, (error, jsonContext) => {
      if (error) {
        logger.error(error);
      }

      if (jsonContext) {        
        return callback(error, jsonContext, fileInfos);
      }

      // JSON is not found

      if (this._baseURL) {
        var reg2=this._getKeyFromFileName(basename);
        if (reg2) {
          this._computeJSONPathInBase(reg2, fileInfos, (error, jsonURL, fileInfos) => {
            if (error || !jsonURL) {
              return callback(error);
            }

            this._loadJSON(jsonURL, fileInfos, (error, jsonContext) => {
              if (error) {
                return callback(error);
              }

              callback(null, jsonContext, fileInfos);
            });
          });
          return;
        }
      }

      if (fileInfos.season===undefined || fileInfos.episode===undefined) {
        return callback();
      }

      var directoryURL = contentURL.join('..');

      debug("_searchJSONFile", "tvShow: directoryURL=", directoryURL, "contentURL=", contentURL);

      this._searchDirectoryJSONFile(directoryURL, (error, jsonContext, directoryInfos) => {
        if (error) {
          return callback(error);
        }
        if (!jsonContext) {
          debug("_searchJSONFile", "tvShow => no JSON for url=", directoryURL);
          return callback();
        }

        directoryInfos.season = fileInfos.season;
        directoryInfos.episode = fileInfos.episode;
        directoryInfos.type = fileInfos.type;

        callback(null, jsonContext, directoryInfos);
      });
    });
  }

  /**
   * 
   */
  prepareMetas(contentInfos, metasContext, callback) {
    var contentURL = contentInfos.contentURL;
    assert(contentURL, "Invalid contentURL");
 
    if (this.enabled===false) {
      return callback();
    }

    if (contentInfos.stats.isDirectory()) {
      this._searchDirectoryJSONFile(contentURL, (error, jsonContext, directoryInfos) => {
        // Test key in 
        if (error || !jsonContext) {
          return callback(error);
        }

        this._processFolder(contentInfos, metasContext, jsonContext, directoryInfos, (error, metas) => {
          if (error) {
            return callback(error);
          }

          metas=metas || {};
          var mt=metas[this.name];
          if (!mt) {
            mt={};
            metas[this.name]=mt;
          }

          metas.resourceType=directoryInfos.type;
          if (directoryInfos.key) {
            mt.key = directoryInfos.key; 
          }
          if (directoryInfos.base) {
            mt.base = directoryInfos.base; 
          }

          callback(null, metas);
        });
      });        
      return;
    }

    this._searchJSONFile(contentURL, (error, jsonContext, fileInfos) => {
      // Test key in 
      if (error || !jsonContext) {
        return callback(error);
      }

      this._processFile(contentInfos, metasContext, jsonContext, fileInfos, (error, metas) => {
        if (error) {
          return callback(error);
        }

        metas=metas || {};
        var mt=metas[this.name];
        if (!mt) {
          mt={};
          metas[this.name]=mt;
        }

        metas.resourceType=fileInfos.type;
        if (fileInfos.key) {
          mt.key = fileInfos.key; 
        }
        if (fileInfos.base) {
          mt.base = fileInfos.base; 
        }

        callback(null, metas);
      });
    });     
  }

  _getKeyFromFileName(contentURL) {
    return null;
  }

  _getKeyFromDirectoryName(contentURL) {
    return null;
  }

  _processFile(contentInfos, metasContext, jsonContext, fileInfos, callback) {
    callback();
  }

  _processFolder(contentInfos, metasContext, jsonContext, directoryInfos, callback) {
    callback();
  }

  _loadJSONfromNode(node, callback) {
    var attributes = node.attributes;

    var contentURL = node.contentURL;

    var resourceType = attributes.resourceType;
    var isBasePath=false;
    var jsonURL;
    if (attributes.jsonBase) {
      // TODO xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      isBasePath=true;


    } else {
      if (resourceType==="directory") {
        jsonURL = contentURL.join(METADATAS_DIRECTORY, DIRECTORY_JSON);

      } else if (resourceType==="tvShow") {
        jsonURL = contentURL.join('..', METADATAS_DIRECTORY, DIRECTORY_JSON);

      } else {      
        var basename=contentURL.basename;       
        jsonURL = contentURL.join('..', METADATAS_DIRECTORY, basename+".json");    
      }
    }

    debug("_loadJSONFromNode", "Node #", node.id, "jsonURL=", jsonURL, "isBasePath=", isBasePath, "attributes=",attributes);

    this._loadJSON(jsonURL, isBasePath, callback);
  }

  _loadJSON(jsonURL, fileInfos, callback) {
    debug("_loadJSON", "try to load jsonURL=",jsonURL, "fileInfos=",fileInfos);

    var jsonContext = MetasJson._jsonCache.get(jsonURL.path);
    if (jsonContext) {
      if (jsonContext instanceof EventEmitter) {
        var eventEmitter = jsonContext;
        debug("_loadJSON", "Wait for async result path=", jsonURL);

        eventEmitter.on('result', (jsonContext) => callback(null, jsonContext));
        eventEmitter.on('problem', (error) => callback( /* no error */));
        return;
      }

      if (jsonContext===JSON_NOT_FOUND_OR_INVALID) {
        debug("_loadJSON", "Return NOT FOUND");
        return callback(null, null);
      }

      debug("_loadJSON", "Return json from url=", jsonURL, "typeof json=", typeof(jsonContext));
      return callback(null, jsonContext);
    }

    var ev=new EventEmitter();    
    MetasJson._jsonCache.put({id: jsonURL.path }, ev);

    jsonURL.stat((error, stats) => {
      if (error) {
        var ex=new Error("Can not stat '"+jsonURL.path+"'");
        ex.reason = error;
        ex.url=jsonURL;

        MetasJson._jsonCache.put({id: jsonURL.path}, JSON_NOT_FOUND_OR_INVALID);

        ev.emit('problem', ex);

        //logger.error(ex);
        return callback(); // Report no problem !
      }

      jsonURL.readContent("utf-8", (error, content) => {
        //debug("_loadJSON", "path=",path, "JSON=",content);

        if (error) {
          MetasJson._jsonCache.put({id: jsonURL.path}, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', error);
          logger.error(error);

          return callback();
        }

        var json;
        try {
          json = JSON.parse(content);

        } catch (x) {
          var ex=new Error("Can not parse JSON ");
          ex.reason=x;
          logger.error(ex);

          MetasJson._jsonCache.put({id: jsonURL.path}, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', ex);
          logger.error(ex);
          return callback();
        }

        var resourcesURL;
        if (fileInfos.base) {
          resourcesURL = jsonURL.join('..');

        } else {
          resourcesURL = jsonURL.join('..', this.name);
        }

        var jsonContext = {
            content: json, 
            url: jsonURL, 
            resourcesURL: resourcesURL
        };

        MetasJson._jsonCache.put({id: jsonURL.path}, jsonContext);

        ev.emit('result', jsonContext);

        callback(null, jsonContext);
      });      
    });
  }
}

module.exports = MetasJson;
