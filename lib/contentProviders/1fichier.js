/*jslint node: true, nomen: true, esversion: 6 */
"use strict";

const assert = require('assert');
const Mime = require('mime');
const fs = require('fs');
const Path = require('path');
const request = require('request');
const crypto = require('crypto');
const Async = require('async');

const debug = require('debug')('upnpserver:contentProviders:1Fichier');
const logger = require('../logger');

const ContentProvider = require('./contentProvider');

const DIRECTORY_MIME_TYPE = "inode/directory";

class OneFichierContentProvider extends ContentProvider {

  constructor(configuration) {
    super(configuration);

    this._cache={};
    
    this._requestQueue = Async.queue((task, callback) => task(callback), configuration.maxRequest || 1);

    this._baseURL=configuration.baseURL || "https://1fichier.com/";
    this._username=this.normalizeParameter(configuration.username);
    var password=this.normalizeParameter(configuration.password);
    this._password=password;
    this._passwordMD5=crypto.createHash('md5').update(password).digest("hex");

    if (!this._username || !this._password) {
      throw new Error("Username or password must be defined !");
    }

    debug("Set baseURL to", this._baseURL, "username=", this._username, "password=", this._passwordMD5);
  }

  /**
   * 
   */
  _convertURL(contentURL) {
    var url=contentURL.substring(this.protocol.length+1);

    if (!url || url==='/') {
      url=this._baseURL+"console/get_folder_content.pl";

    } else {
      var reg=/([^/]+)\/([^\/]+)$/.exec(url);

      if (reg) {
        url = this._baseURL+"console/get_folder_content.pl?id="+reg[2];
      } else {
        reg=/\?([^?]+)$/.exec(url);
        url = this._baseURL+"?"+reg[1];
      }
    }

    debug("Convert content URL of",contentURL,"=>",url);

    return url;
  }

  /**
   * 
   */
  readdir(contentURL, callback) {
    var url=this._convertURL(contentURL);

    var folderId="0";

    var reg=/\/([^\/]+)$/.exec(contentURL);
    if (reg) {
      folderId=reg[1];
    }

    debug("Readdir",contentURL,"folderId=",folderId);

    this._requestQueue.push((callback) => this._readdir(url, folderId, callback), callback);
  }

  _readdir(url, folderId, callback) {

    if (this._badPassword) {
      return callback(new Error("Bad password detected !"));
    }

    var options = {
        qs: {
          user: this._username,
          pass: this._passwordMD5
        }
    };

    request(url, options, (error, response, body) => {
      //debug("Readdir Body=",body);
      if (error) {
        logger.error("Can not read directory ",url,error);
        error.url=url;
        return callback(error);
      }

      if (response.statusCode===403) {
        this._badPassword=true;        
        return callback(new Error("Bad password detected !"));
      }
      
      var json;
      try {
        json = JSON.parse(body);
      } catch (x) {
        x.url=url;
        x.body=body;
        return callback(x);
      }

      if (!(json instanceof Array)) {
        var err=new Error("Invalid readdir response for url="+folderId);
        err.body=body;

        return callback(err);
      }

      var ret=json.map((f) => {

        var stat=this._createStat(f, folderId);

        this._cache[stat.url]=stat;

        console.log(stat);

        return stat.url;
      });

      callback(null, ret);
    });
  }

  _createStat(f, parentId) {
    var stat={
        name: f.name,
        mtime: new Date(f.date),
        type: f.type  ,
        isDirectory: () => f.type==="d",
        isFile: () => f.type!=="d"
    };

    if (f.type==="d") {
      var reg=/console\/get_folder_content\.pl\?id=(.+)$/.exec(f.url);
      stat.url=this.protocol+":"+parentId+"/"+(reg && reg[1]);
      stat.mime=DIRECTORY_MIME_TYPE;

    } else {
      var reg2=/\?(.+)$/.exec(f.url);
      stat.url=this.protocol+":"+parentId+"?"+reg2[1];
      stat.mime=f.mimeType || Mime.lookup(f.name);
    }

    return stat;
  }

  /**
   * 
   */
  stat(contentURL, callback) {

    var stat=this._cache[contentURL];
    if (stat) {
      debug("Stat is in cache",stat);
      return callback(null, stat);
    }

    if (true) {
      // Stat parent !

      var reg=/:([^/]+)\/([^\/]+)$/.exec(contentURL);
      if (!reg) {
        reg=/:([^?]*)\?(\/.+)$/.exec(contentURL);
      }

      var url=this._baseURL+"console/get_folder_content.pl?id="+reg[1];

      this._readdir(url, reg[1], (error, stats) => {
        if (error) {
          return callback(error);
        }

        var stat=stats.find((s) => s.url===contentURL);

        return callback(null, stat);
      });

      return;
    }

    this._requestQueue.push((callback) => this._stat(contentURL, callback), callback);
  }
  
  _stat(contentURL, callback) {  

    if (this._badPassword) {
      return callback(new Error("Bad password detected !"));
    }
 
    var url=this._convertURL(contentURL);

    debug("Stat",contentURL);
    var options = {
        method: "HEAD",
        followRedirect: false,
        qs: {
          user: this._username,
          pass: this._passwordMD5
        }
    };

    debug("Http request", options);

    request(url, options, (error, response, body) => {
      debug("Stat Body=",body);
      if (error) {
        return callback(error);
      }
 
      if (response.statusCode===403) {
        this._badPassword=true;        
        return callback(new Error("Bad password detected !"));
      }
 
      var ret=[];

      callback(null, ret);
    });
  }

  /**
   * 
   */
  createReadStream(session, contentURL, options, callback) {
    debug("createReadStream url=", contentURL, "options=",options);
   
    var url=this._convertURL(contentURL);

    this._requestQueue.push((callback) => this._createReadStream(url, options, callback), callback);
  }
  
  /**
   * 
   */
  _createReadStream(url, options, callback) {

    if (this._badPassword) {
      return callback(new Error("Bad password detected !"));
    }
 
    var auth= {
          user: this._username,
          password: this._password,
          sendImmediately: true
    };

    var requestOptions = { auth: auth, followRedirect: false };
    if (options) {
      if (options.start) {
        var bs="bytes "+options.start;
        if (options.end) {
          bs+=options.end+"/"+(options.end-options.start+1);
        } else {
          bs+="*/*";
        }
        options.headers=options.headers||{};

        options.headers['content-range']=bs;       
      }
    }
    debug("Request options=", requestOptions);

    var rq=request(url, requestOptions);

    rq.on("error", (error) => {
      debug("Get error url=",url,"error=",error);
      error.url=url;
      callback(error);
    });

    rq.on("response", (response) => {
      debug("Get response url=", url, "statusCode=",response.statusCode);
      
      if (response.statusCode===403) {
        this._badPassword=true;        
        return callback(new Error("Bad password detected !"));
      }
 
      if (response.statusCode===302) {
        rq.end();
        var location=response.headers.location;
        debug("Redirect to",location);
        
        if (location && location!==url) {
          setImmediate(() => {
            this._createReadStream(location, options, callback);
          });
        }
        return;
      }

      if (Math.floor(response.statusCode/100)!=2) {
        console.error(response);
        var ex=new Error("Invalid status code "+response.statusCode);
        return callback(ex);
      }
      callback(null, rq);
    });
    rq.end();
  }

  /**
   * 
   */
  toString() {
    return "[1Fichier ContentProvider name='"+this.name+"' username='"+this._username+"']";
  }
}

module.exports = OneFichierContentProvider;
