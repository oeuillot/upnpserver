/*jslint node: true, esversion: 6 */
"use strict";

const fs=require('fs');

const debug = require('debug')('upnpserver:contentHandler');
const logger=require('../logger');

class ContentHandler {

  constructor(configuration) {
    this._configuration=configuration || {};
  }

  /**
   * 
   */
  initialize(contentDirectoryService, callback) {
    this._contentDirectoryService = contentDirectoryService;

    var mimeTypes = this.mimeTypes;
    if (!mimeTypes) {
      return callback();
    }

    var prepareNode = (node, callback) => {
      debug("PrepareNode event of node #",node.id);

      this.prepareMetasFromNode(node, (error) => {
        if (error) {
          logger.error("Prepare node #"+node.id+" error=",error);
          return callback(error);
        }

        debug("PrepareNode event END of node #",node.id);
        callback();
      });
    };


    var toJXML = (node, attributes, request, xml, callback) => {

      debug("toJXML event #",node.id);

      this.toJXML(node, attributes, request, xml, callback);
    };


    // Don't use => because we use arguments !
    var browse = (node, callback) => {
      debug("browse event #",node.id);

      this.browse(node, callback);
    };

    var priority = this.priority;

    mimeTypes.forEach((mimeType) => {

      if (this.prepareMetas) {
        debug("[",this.name,"] Register 'prepare' for mimeType", mimeType, "priority=", priority);

        contentDirectoryService.asyncOn("prepare:" + mimeType, prepareNode,
            priority);
      }

      if (this.toJXML) {
        debug("[",this.name,"] Register 'toJXML' for mimeType", mimeType, "priority=", priority);

        contentDirectoryService.asyncOn("toJXML:" + mimeType, toJXML, priority);
      }

      if (this.browse) {
        debug("[",this.name,"] Register 'browse' for mimeType", mimeType, "priority=", priority);

        contentDirectoryService.asyncOn("browse:" + mimeType, browse, priority);
      }
    });

    callback();
  }

  /**
   * 
   */
  get service() {
    return this._contentDirectoryService;
  }

  /*
   * prepareNode(node, callback) { callback(); }
   */

  searchUpnpClass(fileInfos) {
    return null;
  }

  /**
   * 
   */
  _mergeMetas(attributes, metas) {

    debug("Merge metas=",metas,"to attributes=",attributes);
    if (!metas) {
      return attributes;
    }

    var copyRes = (index, datas) => {
      attributes.res=attributes.res || [];

      var r=attributes.res[index];
      if (!r) {
        r={};
        attributes.res[index]=r;
      }

      for(var n in datas) {
        r[n]=datas[n];
      }
    };

    for(var n in metas) {
      var m=metas[n];
      if (n==='res') {
        for(var i=0;i<m.length;i++) {
          copyRes(i, m[i]);
        }
        continue;
      }

      var c=attributes[n];
      if (false) {
        // Merge artists, albums ??? (a good or bad idea ?)
        if (Array.isArray(c) && Array.isArray(m)) {
          m.forEach((tok) => {
            if (c.indexOf(tok)>=0) {
              return;
            }
            c.push(tok);
          });
        }
      }

      if (c) {
        return;
      }

      attributes[n]=m;
    }

    return attributes;
  }

  /**
   * 
   */
  prepareMetasFromContentURL(contentURL, attributes, callback) {
    if (!this.prepareMetas) {
      return callback(null, attributes);
    }

    var key=this.name+"::"+contentURL;

    this._loadMetas(key, contentURL, (stats, callback) => {
      this.prepareMetas(contentURL, stats, callback);

    }, (error, metas) => {
      if (error) {
        logger.error("loadMetas error", key, contentURL, error);
        // return callback(error); // Continue processing ...
      }

      attributes = this._mergeMetas(attributes, metas);

      callback(null, attributes);
    });
  }

  /**
   * 
   */
  prepareMetasFromNode(node, callback) {
    var contentURL=node.contentURL;
    if (!contentURL) {
      return callback(null, node);
    }

    var key=this.name+"::"+contentURL;

    this._loadMetas(key, contentURL, (stats, callback) => {
      this.prepareMetas(contentURL, stats, callback);

    }, (error, metas) => {
      if (error) {
        return callback(null, node);
      }
      this._mergeMetas(node.attributes, metas);

      callback(null, node);
    });
  }

  _loadMetas(key, path, loadCallback, foundCallback) {
    var registry=this.service.nodeRegistry;

    var contentProvider = this.service.getContentProvider(path);

    contentProvider.stat(path, (error, stats) => {
      if (error) {
        logger.error("Can not stat",path,error);
        return foundCallback(error);
      }

      var mtime=stats.mtime.getTime();

      registry.getMetas(key, mtime, (error, metas) => {
        debug("getMetas of key=",key,"mtime=",mtime,"=>",metas,"error=",error);
        if (error) {
          logger.error("Can not get metas of",key,error);
        }

        if (metas) {        
          foundCallback(null, metas);
          return;
        }

        loadCallback(stats, (error, metas) => {
          if (error) {
            logger.error("Can not compute metas of",key,error);
//          return foundCallback(error);
            metas={error: true};
          }
          debug("getMetas: prepare metas=>",metas);

          registry.putMetas(key, mtime, metas, (error1) => {
            if(error1) {
              logger.error("Can not put metas of", key, error1);
            }

            foundCallback(error || error1, metas);
          });
        });
      });
    });
  }
}

module.exports = ContentHandler;
