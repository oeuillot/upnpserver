/*jslint node: true, sub: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Async = require("async");
const Util = require("util");

const Item = require('./class/object.item');
const ContentDirectoryService = require('./contentDirectoryService');

const Semaphore = require('./util/semaphore');

const debugFactory = require('debug');
const debug = debugFactory('upnpserver:node');
const debugGarbage = debugFactory('upnpserver:node:garbage');
const debugListChildren = debugFactory('upnpserver:node:listChildren');
const debugChildByTitle = debugFactory('upnpserver:node:childByName');

const logger = require('./logger');

const LIST_CHILDREN_LIMIT = 4;

const ASSERT_CAN_NOT_LINK_A_CONTAINER = false;

class Node {

  /**
   * 
   */
  constructor(service) {
    assert(service, "Service is undefined !");
    //assert(id !== undefined, "ID must be defined");

    //this._id = id;
    this._service = service;
  }

  /**
   * 
   */
  static createRef(linkedNode, name, callback) {

    if (ASSERT_CAN_NOT_LINK_A_CONTAINER && linkedNode.isUpnpContainer) {
      var error=new Error("Can not link a container (upnp limitation");
      error.node=linkedNode;
      return callback(error);
    }

    var node = new Node(linkedNode._service);

    linkedNode._service.allocateNodeId(node, (error) => {
      if (error) {
        return callback(error);
      }

      node.refId = linkedNode._id;

      if (name) {
        node.name = name;
      }

      if (debug.enabled) {
        debug("NewNodeRef id=#" + node._id + " name=" + name + " linkedName=" +
            linkedNode.name);
      }

      linkedNode.appendLink(node, (error) => {
        callback(error, node);
      });
    });
  }

  /**
   * 
   */
  static create(service, name, upnpClass, attributes, callback) {

    var node = new Node(service);

    service.allocateNodeId(node, (error) => {
      if (error) {
        return callback(error);
      }

      if (name) {
        node.name = name;
      }
      if (attributes) {
        node.attributes = attributes;
      }

      assert(upnpClass instanceof Item, "UpnpClass must be an item " +
          upnpClass.name);
      node.upnpClass = upnpClass;

      debug("NewNode id=#", node._id, "name=", name, "upnpClass=", upnpClass);

      callback(null, node);
    });
  }

  /**
   * 
   */
  get id() {
    return this._id;
  }

  /**
   * 
   */
  get updateId() {
    return this._updateId || 0;
  }

  registerRepository(repository, callback) {
    var key=repository.id;

    var repositories=this._repositories;

    if (repositories && (key in repositories)) {
      return callback(null, this);
    }

    this.takeLock("repositories", () => {

      if (!repositories) {
        repositories={};       
        this._repositories=repositories;

      } else if (key in repositories) {
        this.leaveLock("repositories");
        return callback(null, this);
      }

      repositories[key]=true;
      this.leaveLock("repositories");

      this.service.saveNode(this, {
        $push: {
          repositories: key
        }

      }, (error) => {
        if (error) {
          logger.error("Can not save node #", this._id, error);
          return callback(error);
        }

        callback(null, this);
      });
    });
  }

  /**
   * 
   */
  removeChild(child, callback) {
    assert(child instanceof Node, "Invalid child parameter");
    assert(typeof(callback)==="function", "Invalid callback parameter");

    debug("removeChild", "Remove child #",child.id," of #",this.id);

    var childrenIds = this.childrenIds;
    if (!childrenIds) {
      let ex = new Error("The node has no children");
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    var idx = childrenIds.indexOf(child._id);
    if (idx < 0) {
      let ex = new Error("Can not find child #" + child._id);
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    if (child.childrenIds && child.childrenIds.length) {
      let ex = new Error("Can not remove child #" + child._id +
      " if its contains children");
      ex.node = this;
      ex.child = child;
      return callback(ex);
    }

    var service = this._service;

    this.takeLock("children", () => {
      idx = childrenIds.indexOf(child._id);
      if (idx < 0) {
        this.leaveLock("children");

        return callback();
      }

      this.childrenIds.splice(idx, 1);
      if (!this._updateId) {
        this._updateId=0;
      }
      this._updateId++;

      delete child._path;
      delete child._parentId;

      service.saveNode(this, {
        updateId : this.updateId,
        $pull : {
          childrenIds : child._id
        }

      }, (error) => {
        this.leaveLock("children");

        if (error) {
          logger.error("Can not save node #", this._id, error);
          return callback(error);
        }

        service.registerUpdate(this);

        var refId = child.refId;

        var unregisterNode = (callback) => {
          service.unregisterNode(child, (error) => {
            if (error) {
              logger.error("Can not unregister node #", child._id, error);
              return callback(error);
            }
  
            callback(null, this);
          });
        };
      
        var removeReferences = (callback) => {
          if (!child.linkedIds) {
            return unregisterNode();              
          }
          
          child.removeAllLinks(unregisterNode);
        };

        if (!refId) {
          return removeReferences();
        }

        service.getNodeById(refId, (error, refNode) => {
          if (error) {
            logger.error("Can not find linked node #", refId, error);
            return callback(error);
          }

          refNode.removeLink(child, removeReferences);
        });
      });
    });
  }

  /**
   * 
   */
  removeAllLinks(callback) {
    assert.equal(typeof(callback), "function", "Invalid callback parameter");

    debug("removeLink", "Remove all links of #",this.id);

    this.takeLock("links", () => {
      var linkedIds = this.linkedIds;
      if (!linkedIds || !linkedIds.length) {
        this.leaveLock("links");
        return callback();
      }

      delete this.linkedIds;

      this._service.saveNode(this, {
        $unset: {
          linkedIds : true
        }

      }, (error) => {        
        this.leaveLock("links");
        if (error) {
          return callback(error);
        }
        
        var service=this.service;

        Async.eachSeries(linkedIds, (linkId, callback) => {
          
          service.getNodeById(linkId, (error, link) => {
            if (error) {
              logger.error("Can not find linked node #", linkId, error);
              return callback(error);
            }
  
            link._removeRef(callback);
          });
        }, (error) => {
          callback(error, this);
        });
      });
    });
  }
  
  _removeRef(callback) {
    delete this.refId;
    this.service.saveNode(this, {
      $unset: { refId: true}

    }, (error) => {
      if (error) {
        return callback(error);
      }
      
      this._updateId++;
      
      this.getParentNode((error, parent) => {
        if (error || !parent) {
          return callback(error);
        }
        
        parent.removeChild(this, callback);
      });      
    });   
  }

  /**
   * 
   */
  removeLink(child, callback) {
    assert(child instanceof Node, "Invalid child parameter");
    assert.equal(typeof(callback), "function", "Invalid callback parameter");

    debug("removeLink", "Remove link #",child.id," of #",this.id);

    this.takeLock("links", () => {
      var linkedIds = this.linkedIds;
      if (!linkedIds) {
        this.leaveLock("links");
        return callback();
      }

      var idx = linkedIds.indexOf(child._id);
      if (idx < 0) {
        this.leaveLock("links");
        return callback(); //new Error("Can not find link"));
      }

      linkedIds.splice(idx, 1);

      this._service.saveNode(this, {
        $pull : {
          linkedIds : child._id
        }

      }, (error) => {        
        this.leaveLock("links");

        if (error) {
          return callback(error);
        }
        
        this._updateId++;

        this._removeRef((error) => {          

          callback(error, this);
        });
      });
    });
  }

  /**
   * 
   */
  appendLink(child, callback) {
    this.takeLock("links", () => {
      var linkedIds = this.linkedIds;

      if (!linkedIds) {
        linkedIds = [];
        this.linkedIds = linkedIds;
      }

      linkedIds.push(child._id);

      this._service.saveNode(this, {
        $push : {
          linkedIds : child._id
        }

      }, (error) => {
        this.leaveLock("links");

        callback(error, this);
      });
    });
  }

  /**
   * 
   */
  appendChild(child, callback) {
    this.insertBefore(child, null, callback);
  }

  /**
   * 
   */
  insertBefore(child, before, callback) {
    if (debug.enabled) {
      debug("InsertBefore parent=#", this._id, " child=#", child._id, " before=#",
          (before ? before._id : null));
    }

    if (typeof (child._parentId) === "number") {
      let ex = new Error("Can not add a child which has already a parent !");
      ex.node = this;
      logger.error(ex);
      return callback(ex);
    }

    var service = this._service;

    // console.log("ENTER #"+this.id+ " #"+child.id);
    this.takeLock("children", () => {
      // console.log("ENTRED #"+this.id+ " #"+child.id);

      if (this._parentId === undefined) {
        let ex = new Error("Can not add a child to parent which is not connected !");
        ex.node = this;
        logger.error(ex);
        return callback(ex);
      }

      var childrenIds = this.childrenIds || [];
      var idx = childrenIds.length;

      if (typeof (before) === "number") {
        if (before > idx) {
          let ex = new Error("Before index overflow idx=" + before);
          ex.node = this;

          this.leaveLock("children");
          logger.error(ex);
          return callback(ex);
        }
        idx = before;

      } else if (before) {
        idx = childrenIds.indexOf(before._id);
        if (idx < 0) {
          let ex = new Error("Before child #" + before._id + " is not found");
          ex.node = this;

          this.leaveLock("children");
          logger.error(ex);
          return callback(ex);
        }
      }

      child._parentId = this._id;
      this.childrenIds = childrenIds;

      childrenIds.splice(idx, 0, child._id);
      if (!this._updateId) {
        this._updateId=0;
      }
      this._updateId++;

      var childModifications = {
          parentId : child._parentId
      };

      if (!this._path) {
        // Node is not connected to the root !
        logger.error("**** Not connected to the root ? #" + this._id, "name=",
            this.name, "refId=", this.refId, "attributes=", this.attributes, "parentId=", this._parentId);

      } else {
        // Connected to root
        var ps = [ this._path ];
        if (this._path !== "/") {
          ps.push("/");
        }
        ps.push(child.name ? child.name : child._id);

        child._path = ps.join('');

        childModifications.path = child._path;
      }

      var nodeModifications = {
          updateId : this.updateId
      };

      if (before) {
        nodeModifications.childrenIds = childrenIds;
      } else {
        nodeModifications.$push = {
            childrenIds : child._id
        };
      }

      service.saveNode(this, nodeModifications, (error) => {
        if (error) {
          logger.error("Can not save node #", this._id, error);
          this.leaveLock("children");
          return callback(error);
        }

        service.saveNode(child, childModifications, (error) => {
          if (error) {
            logger.error("Can not save child node #", child._id, error);
            this.leaveLock("children");
            return callback(error);
          }

          service.registerUpdate(this);

          this.leaveLock("children");
          callback(null, this);
        });
      });
    });
  }

  /**
   * 
   */
  toJSONObject() {
    var obj = {
        id : this._id
    };

    if (this._parentId) {
      obj.parentId=this._parentId;
    }

    if (this.name) {
      obj.name = this.name;
    }
    if (this._path) {
      obj.path = this._path;
    }

    if (this.upnpClass) {
      obj.upnpClass = this.upnpClass.name;
    }

    if (this._updateId) {
      obj.updateId = this._updateId;
    }
    if (this.refId) {
      obj.refId = this.refId;
    }
    if (this.attributes && Object.keys(this.attributes).length) {
      obj.attributes = this.attributes;
    }
    if (this.childrenIds && this.childrenIds.length) {
      obj.childrenIds = this.childrenIds;
    }
    if (this.linkedIds && this.linkedIds.length) {
      obj.linkedIds = this.linkedIds;
    }
    if (this.repositories && Object.keys(this.repositories).length) {
      obj.repositories = this.repositories;
    }

    if (this.contentURL) {
      obj.contentURL = this.contentURL;
      if (this.contentTime) {
        obj.contentTime = this.contentTime;
      }
    }

    return obj;
  }

  /**
   * 
   */
  static fromJSONObject(service, obj) {

    var node = new Node(service);
    node._id=obj.id;
    if (obj.parentId!==undefined) {
      node._parentId=obj.parentId;
    }
    if (obj.name) {
      node.name = obj.name;
    }

    if (obj.upnpClass) {
      node.upnpClass = service.upnpClasses[obj.upnpClass];
      if(!node.upnpClass) {
        assert(node.upnpClass, "Unknown upnpClass '"+obj.upnpClass+"'");
      }
    }

    if (obj.contentProvider) {
      node.contentProvider = service.contentProviders[obj.contentProvider];
    }

    node.attributes = obj.attributes; // || {};

    if (obj.updateId) {
      node._updateId = obj.updateId;
    }

    if (obj.refId!==undefined) {
      node.refId = obj.refId;      
    } 

    if (obj.path) {
      node._path = obj.path;
    }
    if (obj.childrenIds) {
      node.childrenIds = obj.childrenIds;
    }
    if (obj.linkedIds) {
      node.linkedIds = obj.linkedIds;
    }
    if (obj.repositories) {
      node.repositories = obj.repositories;
    }

    if (obj.contentURL) {
      node.contentURL = obj.contentURL;
      if (obj.contentTime) {
        node.contentTime = obj.contentTime;
      }
    }

    return node;
  }

  /**
   * 
   */
  get isUpnpContainer() {
    return this.upnpClass && this.upnpClass.isContainer;
  }
  
  /**
   * 
   */
  get hasChildren() {
    return this.childrenIds && this.childrenIds.length>0;
  }

  /**
   * 
   */
  browseChildren(options, callback) {
    if (arguments.length === 1) {
      callback = options;
      options = undefined;
    }

    this.service.browseNode(this, options, (error) => {
      if (error) {
        logger.error("BrowseNode #"+this._id,error);
        return callback(error);
      }

      this.listChildren(options, callback);
    });
  }

  /**
   * 
   */
  listChildren(options, callback) {
    if (arguments.length === 1) {
      callback = options;
      options = undefined;
    }

    if (!this.hasChildren) {
      // let error=new Error("Node.listChildren #" + this._id, "=> no children");
      return callback(null, []);
    }

    var resolveLinks = options && options.resolveLinks;
    var canUseCache = !resolveLinks;

    var service = this._service;

    if (canUseCache) {
      var cache = service._childrenWeakHashmap.get(this._id, this);
      if (cache) {
        cache = cache.slice(0); // Clone list

        return callback(null, cache);
      }
    }

    var getNodeFunc = (id, callback) => service.getNodeById(id, callback);

    if (resolveLinks) {
      var old = getNodeFunc;
      getNodeFunc = (id, callback) => {
        old(id, (error, node) => {
          if (error) {
            return callback(error);
          }

          node.resolveLink(callback);
        });
      };
    }

    this.takeLock("children", () => {
      var childrenIds = this.childrenIds;
      if (!childrenIds || !childrenIds.length) {
        if (canUseCache) {
          service._childrenWeakHashmap.put(this, []);
        }

        this.leaveLock("children");
        return callback(null, []);
      }

      if (debugListChildren.enabled) {
        debugListChildren("Node.listChildren #", this._id, "=> cached ids list: length=",
            childrenIds.length, "list=", childrenIds);
      }

      Async.mapLimit(childrenIds, LIST_CHILDREN_LIMIT, (id, callback) => {
        getNodeFunc(id, (error, node) => {
          if (error) {
            logger.error("Can not get node #"+id, error, error.stack);
          }
          if (!node) {
            var mapError = new Error("Can not get node #" + id);
            mapError.error=error;
            return callback(mapError);
          }

          callback(null, node);
        });

      }, (error, result) => {
        if (error) {
          logger.error("Can not map ids", error, error.stack);
          if (debugListChildren.enabled) {
            debugListChildren("Node.listChildren #", this._id, "=> map returs error=", error);
          }

          this.leaveLock("children");
          return callback(error);
        }

        if (debugListChildren.enabled) {
          debugListChildren("listChildren #", this._id, "=> map returns", result);
        }

        if (canUseCache) {
          service._childrenWeakHashmap.put(this, result);
        }

        this.leaveLock("children");
        callback(null, result);
      });
    });
  }

  /**
   * 
   */
  filterChildNodes(filter, callback) {
    Node.filterChildNodes(this, null, filter, callback);
  }

  /**
   * 
   */
  static filterChildNodes(parent, list, filter, callback) {

    if (!list) {
      list = [];
    }

    if (filter(parent)) {
      list.push(parent);
    }

    if (!parent.hasChildren) {
      return callback(null, list);
    }

    if (!parent.childrenIds) {
      if (!parent.refId) {
        // TODO follow links ?
      }
      return callback(null, list);
    }

    var service = parent._service;

    Async.eachSeries(parent.childrenIds, (childId, callback) => {
      service.getNodeById(childId, (error, child) => {
        if (error) {
          return callback(error);
        }

        if (!child) {
          return callback(null);
        }

        Node.filterChildNodes(child, list, filter, callback);
      });

    }, (error) => {
      if (error) {
        logger.error("Filter childNodes error",error);
      }
      callback(error, list);
    });
  }

  /**
   * 
   */
  get parentId() {
    return this._parentId;
  }
  /**
   * 
   */
  get path() {
    return this._path;
  }

  /**
   * 
   */
  get service() {
    return this._service;
  }

  /**
   * 
   */
  getParentNode(callback) {
    if (!this._parentId) {
      return callback(null, null);
    }

    var service = this._service;

    service.getNodeById(this._parentId, callback);
  }

  /**
   * 
   */
  getFirstVirtualChildByTitle(title, callback) {
    debugChildByTitle("getFirstVirtualChildByTitle: request for", title);

    this.listChildrenByTitle(title, (error, nodes) => {
      debugChildByTitle("getFirstVirtualChildByTitle: returns", nodes);
      if (error) {
        return callback(error);
      }

      for(var node of nodes) {
        if (node.contentURL) {
          continue;
        }

        debugChildByTitle("getFirstVirtualChildByTitle",
            "Find a virtual title=", title, "in #", this._id, "=> #", node._id);
        return callback(null, node);
      }

      debugChildByTitle("getFirstVirtualChildByTitle", 
          "Can not find virtual title=", title, "in #", this._id);

      callback(null);
    });
  }

  /**
   * 
   */
  listChildrenByTitle(title, callback) {
    debugChildByTitle("listChildrenByTitle: request for ",title);
    this._listChildrenByTitle(title, (error, nodesIds, nodes) => {
      if (error) {
        return callback(error);
      }
      if (nodes) {
        debugChildByTitle("listChildrenByTitle: DIRECT search of", title, "return nodes.count=",nodes.length);
        return callback(null, nodes);
      }
      if (!nodesIds) {
        debugChildByTitle("listChildrenByTitle: DIRECT search of", title, "return EMPTY");
        return callback(null, []);
      }

      var service=this.service;

      Async.mapLimit(nodesIds, LIST_CHILDREN_LIMIT, (id, callback) => service.getNodeById(id, callback), 
          (error, nodes) => {
            if (error) {
              return callback(error);
            }

            debugChildByTitle("listChildrenByTitle: Computed search of", title, "return count=", nodes.length);

            callback(null, nodes);
          });
    });
  }

  /**
   * 
   */
  _listChildrenByTitle(title, callback) {
    debugChildByTitle("_listChildrenByTitle: request for ",title);

    var map=this.service._childrenByTitleWeakHashmap;

    var childrenByTitle=map.get(this._id, this);
    if (childrenByTitle) {
      var children=childrenByTitle[title];

      debugChildByTitle("_listChildrenByTitle: HIT! #",this.id,"title=",title,"=>",children);

      if (children) {
        return callback(null, children);
      }

      return callback(null, []);      
    }

    this.takeLock("childrenByTitle", () => {
      this._mapChildrenByTitle(title, (node) => {
        return (node.attributes && node.attributes.title) || node.name;

      }, (error, childrenByTitle, nodes) => {
        this.leaveLock("childrenByTitle");
        if (error) {
          return callback(error);
        }

        var children=childrenByTitle[title];

        debugChildByTitle("_listChildrenByTitle: SyncedHIT! #",this.id,"title=",title,"=>",children);

        if (children) {
          return callback(null, children, nodes);
        }

        callback(null, []);      
      });
    });
  }

  /**
   * 
   */
  mapChildrenByTitle(callback) {
    debugChildByTitle("mapChildrenByTitle: request map ...");

    var map=this.service._childrenByTitleWeakHashmap;

    var childrenByTitle=map.get(this._id, this);
    if (childrenByTitle) {
      debugChildByTitle("mapChildrenByTitle: map in cache");
      return callback(null, childrenByTitle);
    }

    this.takeLock("childrenByTitle", () => {
      this._mapChildrenByTitle(null, (node) => {
        return (node.attributes && node.attributes.title) || node.name;

      }, (error, childrenByTitle) => {
        this.leaveLock("childrenByTitle");

        if (error) {
          return callback(error);
        }

        callback(null, childrenByTitle);
      });
    });
  }  

  /**
   * 
   */
  _mapChildrenByTitle(title, getTitleCallback, callback) {
    debugChildByTitle("_mapChildrenByTitle: request map title=",title);

    var map=this.service._childrenByTitleWeakHashmap;

    var childrenByTitle=map.get(this._id, this);
    if (childrenByTitle) {
      debugChildByTitle("_mapChildrenByTitle: map in cache !");
      return callback(null, childrenByTitle);
    }

    childrenByTitle={};
    var nodes=[];
    var l;
    this.eachChild((node, link) => {
      var ntitle = getTitleCallback(node);

      if (ntitle) {
        l=childrenByTitle[ntitle];
        if (!l) {
          l=[node._id];
          childrenByTitle[ntitle]=l;
        } else {
          l.push(node._id);
        }

        if (ntitle===title) {
          nodes.push(node);
        }
      }

      if (!link || node===link) {
        return;
      }

      var linkTitle = getTitleCallback(link);
      if (!linkTitle || ntitle === linkTitle) {
        return;
      }

      l=childrenByTitle[linkTitle];
      if (!l) {
        l=[node._id];
        childrenByTitle[linkTitle]=l;
      } else {
        l.push(node._id);
      }

      if (linkTitle===title) {
        nodes.push(node);
      }

    }, (error) => {
      if (error) {         
        logger.error("Can not create map",error);
        return callback(error);
      }

      debugChildByTitle("_mapChildrenByTitle: map=",childrenByTitle);

      map.put(this, childrenByTitle);

      callback(null, childrenByTitle, nodes);
    });
  }

  /**
   * 
   */
  eachChild(testFunc, callback) {
    assert(typeof(testFunc)==="function", "Invalid testFunc parameter");
    assert(typeof(callback)==="function", "Invalid callback parameter");

    this.listChildren((error, children) => {
      if (error) {
        return callback(error);
      }

      var links=[];

      for (var child of children) {
        var test = testFunc(child, child);
        if (test) {
          return callback(null, child);
        }

        if (child.refId) {
          links.push(child);
          continue;
        }
      }

      if (!links.length) {
        if (debugChildByTitle) {
          debugChildByTitle("eachChild #", this._id, "=> NO RESULT (no links)");
        }

        return callback();
      }

      var loopError;
      Async.detectSeries(links, (link, callback) => {

        link.resolveLink((error, node) => {
          if (error) {
            logger.error("Can not resolve link #",link._id,error);
            loopError=error;
            return callback(true); // Stop immediately
          }

          var ret=testFunc(node, link);
          callback(ret); // True value  stops the loop !
        });
      }, (result) => {
        if (loopError) {
          return callback(loopError);
        }

        if (result) {
          return callback(null, result);
        }

        if (debugChildByTitle) {
          debugChildByTitle("eachChild #", this._id, "=> NOT FOUND");
        }

        callback();
      });
    });
  }

  /**
   * 
   */
  resolveLink(callback) {
    if (!this.refId) {
      return callback(null, this);
    }

    this._service.getNodeById(this.refId, (error, child) => {
      if (error) {
        return callback(error);
      }

      if (child) {
        child.resolveLink(callback);
        return;
      }

      logger.error("Can not find refId #"+this.refId+" of node #"+this.id+" try to repair it !");

      this.takeLock("links", () => {
        delete this.refId;

        this.service.saveNode(this, {
          $unset: { refId: true}

        }, (error) => {          
          this.leaveLock("links");

          callback(error, this);
        });
      });
    });
  }

  /**
   * 
   */
  addSearchClass(searchClass, includeDerived) {

    var searchClasses = this.searchClasses;
    if (!searchClasses) {
      searchClasses = [];
      this.searchClasses = searchClasses;
    }

    for (var sc of searchClasses) {
      if (sc.name !== searchClass) {
        continue;
      }

      sc.includeDerived = sc.includeDerived || includeDerived;

      return;
    }

    searchClasses.push({
      name : searchClass,
      includeDerived : includeDerived
    });
  }

  /**
   * 
   */
  treeString(callback) {
    return this._treeString("", callback);
  }

  /**
   * 
   */
  _treeString(indent, callback) {
    // logger.debug("TreeString " + this);

    indent = indent || "";

    var s = indent + "# " + this + "\n";
    if (!this.hasChildren) {
      return callback(null, s);
    }

    indent += "  ";
    if (!this.childrenIds) {
      if (!this.refId) {
        s += indent + "<Unknown children>\n";
      }
      return callback(null, s);
    }

    var service = this._service;

    Async.eachSeries(this.childrenIds, (childId, callback) => {
      service.getNodeById(childId, (error, child) => {
        if (error) {
          return callback(error);
        }

        if (!child) {
          s += "<NULL>";
          return callback(null);
        }

        child._treeString(indent, (error, s2) => {
          if (s2) {
            s += s2;
          }

          callback(null);
        });
      });

    }, (error) => callback(error, s));
  }
 
  /**
   * 
   */
  toString() {
    var s = "[Node id=" + this._id;

    // s += " path=" + this.path;

    if (this.upnpClass) {
      s += " upnpClass='" + this.upnpClass + "'";
    }

    if (this.name) {
      s += " name='" + this.name + "'";
    }

    if (this.refId) {
      s += " refId=" + this.refId;
    }

    return s + "]";
  }

  /**
   * 
   */
  takeLock(lockName, callback) {
    var semaphores = this._semaphores;
    if (!semaphores) {
      semaphores = {};
      this._semaphores = semaphores;
    }
    var semaphore = semaphores[lockName];
    if (!semaphore) {
      semaphore = new Semaphore("Node#"+this._id+":"+lockName);
      semaphores[lockName] = semaphore;
    }

    semaphore.take(callback);
  }

  /**
   * 
   */
  leaveLock(lockName) {
    var semaphores = this._semaphores;
    if (!semaphores) {
      throw new Error("Invalid Semaphores context");
    }
    var semaphore = semaphores[lockName];
    if (!semaphore) {
      throw new Error("Invalid Semaphore context '" + lockName + "'");
    }

    semaphore.leave();
  }

  /**
   * 
   */
  _isLocked() {
    var semaphores = this._semaphores;
    if (!semaphores) {
      return false;
    }
    for ( var k in semaphores) {
      var semaphore = semaphores[k];
      if (semaphore.current) {
        return k;
      }
    }

    return false;
  }
}

module.exports = Node;
