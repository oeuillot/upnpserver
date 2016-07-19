/*jslint node: true, esversion: 6, maxlen: 180 */
"use strict";

const Path = require('path');
const EventEmitter = require('events');

const assert = require('assert');
const debug = require('debug')('upnpserver:contentHandlers:MetasJson');
const logger = require('../logger');

const Abstract_Metas = require('./abstract_metas');
const NodeWeakHashmap = require('../util/nodeWeakHashmap');
const NamedSemaphore = require('../util/namedSemaphore');

const METADATAS_DIRECTORY = ".upnpserver";
const DIRECTORY_JSON = "";

const JSON_NOT_FOUND_OR_INVALID = "***INVALID***";

class MetasJson extends Abstract_Metas {
  constructor(configuration) {
    super(configuration);

    this._basePath = this._configuration.basePath;

    this._jsonSemaphores = new NamedSemaphore("json:" + this.name);

    if (!MetasJson._jsonCache) {
      MetasJson._jsonCache = new NodeWeakHashmap("json", 1000 * 60, false);
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

  _searchDirectoryJSONFile(contentURL, metasContext, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    this._jsonSemaphores.take(contentURL.path, (semaphore) => {
      this._searchDirectoryJSONFile0(contentURL, metasContext, (error, jsonContext, directoryInfos) => {
        semaphore.leave();

        debug("_searchDirectoryJSONFile", "return error=", error);

        if (error) {
          callback();
          return;
        }

        callback(null, jsonContext, directoryInfos);
      });
    });
  }

  _searchForKey(name, type, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");
    callback(null);
  }

  _searchDirectoryJSONFile0(contentURL, metasContext, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    var jsonURL = contentURL.join(METADATAS_DIRECTORY, DIRECTORY_JSON + "." + this.name + ".json");

    debug("_searchDirectoryJSONFile", "Directory: test", contentURL, "jsonURL=", jsonURL);

    var directoryInfos = {
      type: 'directory',
      base: false
    };

    // Search tmdb json file in the directory

    this._loadJSON(jsonURL, false, (error, jsonContext) => {
      var content;

      debug("_searchDirectoryJSONFile", "loadJSON url=", jsonURL, "returns", jsonContext);

      if (jsonContext) {
        content = jsonContext.content;

        if (content.key && content.type === 'tvShow' && content.tvShowInfo) {
          return callback(null, jsonContext, directoryInfos);
        }
      }

      if (!this._baseURL) {
        // no tmdb repository

        debug("_searchDirectoryJSONFile", "no tmdb baseURL, exit !");
        return callback(error);
      }

      // Compute the json file name associated to the directory
      var loadBaseJSON = (k, jsonContext) => {

        debug("_searchDirectoryJSONFile", "loadBaseJSON=", k);

        this._computeJSONPathInBase(k, directoryInfos, (error, jsonURL, directoryInfos) => {

          debug("_searchDirectoryJSONFile", "computeJSONPath error=", error, "url=", jsonURL, "directoryInfos=", directoryInfos);
          if (error) {
            return callback(error);
          }

          if (!jsonURL) {
            return callback(null);
          }

          directoryInfos.base = true;

          // Load the json

          this._loadJSON(jsonURL, true, (error, jsonContext) => {
            if (error) {
              return callback(error);
            }

            if (!jsonContext) {
              debug("_searchDirectoryJSONFile", "No json", jsonURL);

              this._updateInfos(k.key, content.type, {}, (error2, content) => {
                debug("_searchDirectoryJSONFile", "UpdateInfos key=", k.key, "type=", content.type,
                  "returns error=", error2, "content=", content);

                if (error2) {
                  return callback(error2);
                }

                if (!content) {
                  return callback(error);
                }

                var ret = {
                  key: k.key,
                  type: k.type
                };
                ret[k.type] = content;

                this.saveJSON(jsonURL, ret, true, (error, jsonContext) => {
                  if (error) {
                    logger.error(error);
                  }

                  callback(null, jsonContext, directoryInfos);
                });
              });
              return;
            }

            callback(null, jsonContext, directoryInfos);
          });
        });
      };


      // A tmdb repository ! search the key in the folder name

      var reg;
      if (!reg && content && content.key && content.type) {
        reg = {
          key: content.key,
          type: content.type
        };
      }

      if (!reg) {
        reg = this._getKeyFromDirectoryName(contentURL.basename);
      }

      if (!reg && content && content.type) {
        debug("_searchDirectoryJSONFile", "Search for key=", contentURL.basename);

        this._searchForKey(contentURL.basename, content.type, (error, key) => {
          if (error) {
            return callback(error);
          }

          if (!key) {
            return callback();
          }

          content.key = key;
          reg = {
            key: key,
            type: content.type
          };

          this.saveJSON(jsonContext.url, jsonContext.content, jsonContext.isBaseURL, (error, jsonContext) => {
            if (error) {
              logger.error(error);
            }
            loadBaseJSON(reg, jsonContext);
          });
        });
        return;
      }

      if (!reg) {
        // No key in the foldername nor in the metaContext (mkv metadatas), abort the search
        return callback(error);
      }

      loadBaseJSON(reg, jsonContext);
    });
  }

  _searchJSONFile(contentURL, metasContext, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");
    this._jsonSemaphores.take(contentURL.path, (semaphore) => {
      this._searchJSONFile0(contentURL, metasContext, (error, jsonContext, directoryInfos) => {
        semaphore.leave();

        if (error) {
          callback();
          return;
        }
        callback(null, jsonContext, directoryInfos);
      });
    });
  }

  _searchJSONFile0(contentURL, metasContext, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    var basename = contentURL.basename;

    var jsonURL = contentURL.join('..', METADATAS_DIRECTORY, basename + "." + this.name + ".json");

    debug("_searchJSONFile", "File: jsonURL=", jsonURL, "contentURL=", contentURL, "basename=", basename);

    var fileInfos = { type: 'file', base: false };

    var regBasename = basename.replace(/_/g, ' ');
    var season;
    var episode;
    var reg = /\bS(\d{1,})[-\s]*E(\d{1,})\b/i.exec(regBasename);
    if (reg) {
      fileInfos.season = parseInt(reg[1], 10);
      fileInfos.episode = parseInt(reg[2], 10);
      fileInfos.type = "tvShow";

    } else {
      reg = /\bE(\d{1,})\b/i.exec(regBasename);
      if (reg) {
        fileInfos.season = 0;
        fileInfos.episode = parseInt(reg[1], 10);
        fileInfos.type = "tvShow";
      }
    }

    debug("_searchJSONFile", "File no JSON season=", season, "episode=", episode);

    var searchInDirectory = () => {

      if (fileInfos.season === undefined || fileInfos.episode === undefined) {
        // No season, no episode number,  no reason to search metadatas in directory
        return callback();
      }

      var directoryURL = contentURL.join('..');

      debug("_searchJSONFile", "tvShow: directoryURL=", directoryURL, "contentURL=", contentURL);

      this._searchDirectoryJSONFile(directoryURL, metasContext, (error, jsonContext, directoryInfos) => {
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
    };

    this._loadJSON(jsonURL, false, (error, jsonContext) => {
      if (error) {
        logger.error(error);
      }

      if (jsonContext) {
        return callback(error, jsonContext, fileInfos);
      }

      // JSON is not found search in tmdb repository if any !

      var resourceKey;
      if (metasContext.keys) {
        resourceKey = metasContext.keys[this.domainKey];
      }

      if (!resourceKey) {
        // Search tv key in filename
        resourceKey = this._getKeyFromFileName(basename);
      }

      if (!resourceKey) {
        // No key 
        searchInDirectory();
        return;
      }

      this._computeJSONPathInBase(resourceKey, fileInfos, (error, jsonURL, fileInfos) => {
        if (error || !jsonURL) {
          searchInDirectory();
          return callback(error);
        }

        this._loadJSON(jsonURL, true, (error, jsonContext) => {
          if (error) {
            return callback(error);
          }

          if (!jsonContext) {
            // No data, search metas in directory
            searchInDirectory();
            return;
          }

          callback(null, jsonContext, fileInfos);
        });
      });
    });
  }

  /**
   * 
   */
  prepareMetas(contentInfos, metasContext, callback) {
    var contentURL = contentInfos.contentURL;
    assert(contentURL, "Invalid contentURL");

    if (this.enabled === false) {
      return callback();
    }

    if (contentInfos.stats.isDirectory()) {
      this._searchDirectoryJSONFile(contentURL, metasContext, (error, jsonContext, directoryInfos) => {
        // Test key in
        if (error || !jsonContext) {
          return callback(error);
        }

        this._processFolder(contentInfos, metasContext, jsonContext, directoryInfos, (error, metas) => {
          if (error) {
            return callback(error);
          }

          metas = metas || {};
          var mt = metas[this.name];
          if (!mt) {
            mt = {};
            metas[this.name] = mt;
          }

          metas.resourceType = directoryInfos.type;
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

    this._searchJSONFile(contentURL, metasContext, (error, jsonContext, fileInfos) => {
      // Test key in
      if (error || !jsonContext) {
        return callback(error);
      }

      this._processFile(contentInfos, metasContext, jsonContext, fileInfos, (error, metas) => {
        if (error) {
          return callback(error);
        }

        metas = metas || {};
        var mt = metas[this.name];
        if (!mt) {
          mt = {};
          metas[this.name] = mt;
        }

        metas.resourceType = fileInfos.type;
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

  _getBaseDirectoryFromNode(node, callback) {
    var attributes = node.attributes;
    var contentURL = node.contentURL;
    var resourceType = attributes.resourceType;

    if (resourceType === "directory") {
      return contentURL.join(METADATAS_DIRECTORY, this.name);
    }

    return contentURL.join('..', METADATAS_DIRECTORY, this.name);
  }

  saveJSON(jsonURL, content, isBaseURL, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");

    debug("saveJSON", "try to save jsonURL=", jsonURL, "content=", content);

    // var oldJsonContext = MetasJson._jsonCache.get(jsonURL.path);
    var newJsonContext = {
      url: jsonURL,
      content: content,
      isBaseURL: isBaseURL
    };

    MetasJson._jsonCache.put({ id: jsonURL.path }, newJsonContext);

    var buffer = JSON.stringify(content, null, 2);

    jsonURL.writeContent(buffer, "utf8", (error) => {
      if (error) {
        return callback(error);
      }

      callback(null, newJsonContext);
    });
  }

  _loadJSON(jsonURL, isBaseURL, callback) {
    assert(typeof (callback) === "function", "Invalid callback parameter");
    assert(typeof (isBaseURL) === "boolean", "Invalid isBaseURL parameter");

    debug("_loadJSON", "try to load jsonURL=", jsonURL, "isBaseURL=", isBaseURL);

    var jsonContext = MetasJson._jsonCache.get(jsonURL.path);
    if (jsonContext) {
      if (jsonContext instanceof EventEmitter) {
        var eventEmitter = jsonContext;
        debug("_loadJSON", "Wait for async result path=", jsonURL);

        eventEmitter.on('result', (jsonContext) => callback(null, jsonContext));
        eventEmitter.on('problem', (error) => callback( /* no error */));
        return;
      }

      if (jsonContext === JSON_NOT_FOUND_OR_INVALID) {
        debug("_loadJSON", "Return NOT FOUND");
        return callback(null, null);
      }

      debug("_loadJSON", "Return json from url=", jsonURL, "typeof json=", typeof (jsonContext));
      return callback(null, jsonContext);
    }

    var ev = new EventEmitter();
    MetasJson._jsonCache.put({ id: jsonURL.path }, ev);

    jsonURL.stat((error, stats) => {
      if (error) {
        debug("_loadJSON", "Stat returns error", error);

        var ex = new Error("Can not stat '" + jsonURL.path + "'");
        ex.reason = error;
        ex.url = jsonURL;

        MetasJson._jsonCache.put({ id: jsonURL.path }, JSON_NOT_FOUND_OR_INVALID);

        ev.emit('problem', ex);

        // logger.error(ex);
        return callback(); // Report no problem !
      }

      jsonURL.readContent("utf8", (error, content) => {
        // debug("_loadJSON", "path=",path, "JSON=",content);

        if (error) {
          debug("_loadJSON", "ReadContent returns error", error);

          MetasJson._jsonCache.put({ id: jsonURL.path }, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', error);
          logger.error(error);

          return callback();
        }

        var json;
        try {
          json = JSON.parse(content);

        } catch (x) {
          debug("_loadJSON", "JSON parsing throws exception", x);

          var ex = new Error("Can not parse JSON ");
          ex.reason = x;
          logger.error(ex);

          MetasJson._jsonCache.put({ id: jsonURL.path }, JSON_NOT_FOUND_OR_INVALID);

          ev.emit('problem', ex);
          logger.error(ex);
          return callback();
        }

        var jsonContext = {
          content: json,
          url: jsonURL,
          isBaseURL: isBaseURL
        };

        debug("_loadJSON", "jsonContext=", jsonContext);

        MetasJson._jsonCache.put({ id: jsonURL.path }, jsonContext);

        ev.emit('result', jsonContext);

        callback(null, jsonContext);
      });
    });
  }
}

module.exports = MetasJson;
