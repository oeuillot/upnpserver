/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";

var http = require('http');
var URL = require('url');
var util = require('util');

var Async = require('async');
var jstoxml = require('jstoxml');
var Uuid = require('node-uuid');
var xmldoc = require('./util/xmldoc');

var AsyncEventEmitter = require('./asyncEventEmitter');
var ErrorSoap = require('./util/errorSoap');
var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;
var StateVar = require("./stateVar");
var Xmlns = require('./xmlns');


var debug = require('debug')('upnpserver:service');
var debugEvent = require('debug')('upnpserver:service:event');

var EVENT_CLIENTS_PROCESSOR_LIMIT = 4;
var DEFAULT_TIMEOUT_SECOND = 60 * 30;
var TIMEOUT_SECOND_MAX = 60 * 60 * 2;

var Service = function(properties, configuration) {
  AsyncEventEmitter.call(this);

  this.configuration = configuration;
  this.version = configuration.version || 1;
  this.type = properties.serviceType + ":" + this.version;
  this.id = properties.serviceId;
  this.route = properties.route;
  this.stateVars = {};
  this.stateActions = {};

  // add as per service basis soap errors
  this.ErrorSoap = null;

  // store classPrefix to require new service instanceson the fly
  this.classPrefix = "";

  // routes postfix for multiple service instances
  if (configuration.InstanceID) {
    this.route += "_" + configuration.InstanceID;
  }

  this._serviceJXML = {
    _name : "service",
    _content : {
      serviceType : this.type,
      serviceId : this.id,
      SCPDURL : "/" + this.route + "/scpd.xml",
      controlURL : "/" + this.route + "/control",
      eventSubURL : "/" + this.route + "/event"
    }
  };

  this._descJXML = {
    _name : "scpd",
    _attrs : {
      xmlns : Xmlns.UPNP_SERVICE
    },
    _content : {
      specVersion : {
        major : 1,
        minor : 0
      },
      actionList : [],
      serviceStateTable : []
    }
  };

  this._eventClients = {};
  this._eventKey = Date.now();
};
module.exports = Service;

util.inherits(Service, AsyncEventEmitter);

Service.prototype.initialize = function(device, callback) {
  this.device = device;

  return callback(null, this);
};

Service.prototype.serviceToJXml = function() {
  return this._serviceJXML;
};

Service.prototype.descToJXml = function() {
  return this._descJXML;
};

Service.prototype.addAction = function(name, inParameters, outParameters) {

  // Handle stateActions automatically when no handler are found
  if (!this["processSoap_" + name]) {
    this.stateActions[name] = outParameters;
  }

  var action = {
    _name : "action",
    _content : {
      name : name,
      argumentList : []
    }
  };

  if (inParameters) {
    inParameters.forEach(function(p) {
      action._content.argumentList.push({
        _name : "argument",
        _content : {
          name : p.name,
          direction : "in",
          relatedStateVariable : p.type
        }
      });
    });
  }

  if (outParameters) {
    outParameters.forEach(function(p) {
      action._content.argumentList.push({
        _name : "argument",
        _content : {
          name : p.name,
          direction : "out",
          relatedStateVariable : p.type
        }
      });
    });
  }

  this._descJXML._content.actionList.push(action);
};

Service.prototype.addType = function(name, type, value, valueList, ns, evented,
    moderation_rate, additionalProps, preEventCb, postEventCb) {

  this.stateVars[name] = new StateVar(this, name, type, value, ns, evented,
      moderation_rate, additionalProps, preEventCb, postEventCb);

  var r = {
    _name : "stateVariable",
    _attrs : {
      sendEvents : (evented && evented !== 2) ? "yes" : "no"
    },
    _content : {
      name : name,
      dataType : type
    }
  };
  if (valueList && valueList.length) {
    var allowedValueList = [];
    r._content.allowedValueList = allowedValueList;

    valueList.forEach(function(v) {
      allowedValueList.push({
        _name : "allowedValue",
        _content : v
      });
    });
  }

  this._descJXML._content.serviceStateTable.push(r);
};

Service.prototype.processRequest = function(request, response, path, callback) {

  var self = this;

  var reg = /([^\/]+)(\/.*)?/.exec(path);
  if (!reg) {
    return callback("Invalid path (" + path + ")");
  }
  var segment = reg[1];
  // var action = reg[2];

  switch (segment) {
  case "scpd.xml":
    return this.processScpdRequest(request, response, function(error) {
      callback(error, true);
    });

  case "control":
    return this.processControlRequest(request, response, function(error) {
      if (error) {
        self.soapError(response, error, function(err) {
          if (err) {
            logger.error("Can't send soapError response");
          }

          callback(null, true);
        });
        return;
      }
      callback(null, true);
    });

  case "event":
    return this.processEventRequest(request, response, function(error) {
      callback(error, true);
    });
  }

  // logger.debug("Unknown request url '" + path + "'");
  return callback(null, false);
};

Service.prototype.processScpdRequest = function(request, response, callback) {
  var xml = jstoxml.toXML(this._descJXML, {
    header : true,
    indent : " ",
    filter : xmlFilters
  });
  // logger.debug("SCPD: Response=", xml);
  response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
  response.end(xml, "UTF-8");

  if (debug.enabled) {
    debug("SCDP request: returns: " + xml);
  }

  return callback(null, true);
};

/*
 * Route request to instance for services with multiple instances
 * return scope : the instance
 */
Service.prototype.getServiceInstance = function(xml, callback){

  var self = this;

  var route;

  if (!this.stateVars["A_ARG_TYPE_InstanceID"]){
    return  callback(null, null, this);
  }

  var InstanceID = self.childValue(xml, "InstanceID", Xmlns.UPNP_SERVICE);

  // exclude instance with id 0 (default instance)
  if (InstanceID && InstanceID != "0") {
    route = self.route + "_" + InstanceID;
  }

  if (route){

    if (self.device.services[route]){
      callback(null, null, self.device.services[route]);
      return
    }

    callback(718, "Invalid InstanceID");
    return
  }

  callback(null, null, this);

}

Service.prototype.processSoapHandlers = function(fn, request, callback){

  var self = this;
  if (fn){
    fn.call(self, request, function(soapErrorCode, error){
      if (soapErrorCode) {

        error = {
          soapErrorCode : soapErrorCode,
          error : error
        };

        callback(error);
        return;
      }

      callback(null);
    });
  } else {
    callback(null);
  }

}

Service.prototype.processSoapInParams = function(xml, soapAction, callback){
  // Process In Params

  var als = this._descJXML._content.actionList;
  var i;
  for (i = 0; i < als.length; i++) {
    var a = als[i];
    if (a._content.name === soapAction) {
      var args = a._content.argumentList;
      var arg;
      var j;
      for (j = 0; j < args.length; j++) {
          arg = args[j]._content;
          if (arg.direction === "in"){
            var value = this.childValue(xml, arg.name, Xmlns.UPNP_SERVICE);
            if (value === ""){
               value = undefined;
            }
            this.stateVars[arg.relatedStateVariable].set(value);
          }
      }
      break;
    }
  }
  callback(null);
}

Service.prototype.processSoapOutParams = function(xmlns, _content, soapAction, callback){
  // Process out Params
  var als = this._descJXML._content.actionList;
  var i;
  for (i = 0; i < als.length; i++) {
    var a = als[i];
    if (a._content.name === soapAction) {
      var args = a._content.argumentList;
      var arg;
      var stateVar;
      var j;
      for (j = 0; j < args.length; j++) {
          arg = args[j]._content;
          if (arg.direction === "out"){
            stateVar = this.stateVars[arg.relatedStateVariable];
            if (!stateVar){
                throw (new Error("Cant find out.type :"+out.type+" in stateVars"));
            }
            _content[arg.name] = stateVar.get();
            if (stateVar.ns) {
              for ( var ns in stateVar.ns) {
                xmlns["xmlns:"+ns] = stateVar.ns[ns];
              }
            }
          }
      }
      break;
    }
  }
  callback(null);
}

Service.prototype.processSoapRequest = function(fn, xml, soapAction, request,
  response, callback){

  var self = this;

  var xmlns = {
    "xmlns:u" : this.type
  };
  var _content = {};

  this.getServiceInstance(xml, function(soapErrorCode, error,  scope){

    // scope is a service instance

    if (error) {

      error = {
        soapAction : soapAction,
        soapErrorCode : soapErrorCode,
        error : error,
        xml : xml
      };

      return self.soapError(response, error, callback);

    }

    Async.series({
      processSoapInParams:function(next){
        self.processSoapInParams.call(scope, xml, soapAction, next);
      },
      processSoapHandlers:function(next){
        self.processSoapHandlers.call(scope, fn, next);
      },
      processSoapOutParams:function(next){
        self.processSoapOutParams.call(scope, xmlns, _content, soapAction, next);
      }
    },function(error){
      // soap error response
      if (error){

        debug("processControlRequest: Can not process soap action '" +
            soapAction + "': ");

        return self.soapError(response, error, callback);
      }
      // soap response
      var resJxml =  {
        _name : "u:" + soapAction + "Response",
        _attrs : xmlns,
        _content : _content
      };
      self.responseSoap(response, soapAction, resJxml, function(error) {
          if (error) {
            return callback(501, error);
          }
          callback(null);
        });
      });
    });
}

Service.prototype.processControlRequest = function(request, response, callback) {

  var soapAction = request.headers.soapaction;

  if (debug.enabled) {
    debug("Control: soapAction=", soapAction, "headers=", request.headers);
  }

  if (!soapAction) {
    return callback(501, "processControlRequest: No soap action !");
  }

  var reg = /"?([^#"]+)(#[^"]*)?"?/.exec(soapAction);
  if (reg[2]) {
    var type = reg[1];
    if (type !== this.type) {
      return callback(401, "processControlRequest: Invalid type '" + type +
          "' / '" + this.type + "' !");
    }
    soapAction = reg[2].slice(1);

  } else {
    soapAction = reg[1];
  }

  var als = this._descJXML._content.actionList;

  var fn = null;
  var found = false;
  var i;
  for (i = 0; i < als.length; i++) {
    var a = als[i];
    if (a._content.name === soapAction) {
      // use handler if any
      fn = this["processSoap_" + soapAction];
      found = true;
      break;
    }
  }
  if (!found) {
    return callback(401,
        "processControlRequest: Unknown soap function 'processSoap_" +
            soapAction + "'");
  }

  var body = "";
  request.on('data', function(data) {
    body += data;
  });

  var self = this;
  request.on('end', function() {
    var xml = new xmldoc.XmlDocument(body);

    // allow routing of requests to service instances
    self.processSoapRequest.call(self, fn, xml, soapAction, request, response, callback);

    if (debug.enabled) {
      debug("Request body=", body, " xml=", xml);
    }

  });
};

Service.prototype.processEventRequest = function(request, response, callback) {

  if (debug.enabled) {
    debug("Process event request ", request.method, " from ",
        request.connection.remoteAddress + " service=" + this.type);
  }

  if (request.method == "SUBSCRIBE") {
    return this.processSubscribe(request, response, callback);
  }

  if (request.method == "UNSUBSCRIBE") {
    return this.processUnsubscribe(request, response, callback);
  }

  logger.error("Invalid request method " + request.method);

  callback("Invalid request method " + request.method);
};

Service.prototype.processUnsubscribe = function(request, response, callback) {
  var sid = request.headers.sid;

  if (!sid) {
    return callback("Invalid unsubscribe request sid parameter", true);
  }

  var idx = sid.indexOf(':');
  if (idx < 0) {
    return callback("Invalid unsubscribe request sid parameter '" + sid + "'",
        true);
  }

  response.end();

  var uuid = sid.substring(idx + 1);

  var client = this._eventClients[uuid];
  if (!client) {
    logger.warn("Unsubscribe: Unknown client uuid=", uuid);
    return callback(null, true);
  }

  delete this._eventClients[uuid];

  client.deleted = true;

  logger.info("Unsubscribe: Delete client uuid=", uuid, " url=", client.url);

  return callback(null, true);
};

Service.prototype.processSubscribe = function(request, response, callback) {
  var headers = request.headers;

  // console.log("Headers=", headers);

  var callbackHeader = headers.callback;
  var nt = headers.nt;
  var timeoutHeader = headers.timeout;

  var callbackURL;
  if (callbackHeader) {
    var result = /^<([^>]+)>$/.exec(callbackHeader);
    if (result && result.length) {
      callbackURL = result[1];
    }
  }

  var timeoutSecond = DEFAULT_TIMEOUT_SECOND;
  if (timeoutHeader) {
    var result2 = /^Second\-([0-9]+)$/.exec(timeoutHeader);
    if (result2 && result2.length) {
      timeoutSecond = result2[1];
    } else if (timeoutHeader == "infinite") {
      timeoutSecond = TIMEOUT_SECOND_MAX;
    }
  }

  // console.log("Header=", request.headers);

  var uuid = null;
  var sid = request.headers.sid;
  if (sid) {
    var result3 = /uuid:(.*)+$/.exec(sid);
    if (result3 && result3.length) {
      uuid = result3[1];

      if (uuid) {
        var ec = this._eventClients[uuid];
        if (ec) {
          callbackURL = ec.url;
          if (!timeoutSecond) {
            timeoutSecond = ec.timeoutSecond;
          }
        }
      }
    }
  }

  if (!uuid && (!callbackURL || nt != "upnp:event")) {
    return callback("Invalid request parameters callbackURL=" + callbackURL +
        " timeout=" + timeoutSecond, true);
  }

  if (timeoutSecond > TIMEOUT_SECOND_MAX) {
    timeoutSecond = TIMEOUT_SECOND_MAX;
  }

  if (!uuid) {
    uuid = Uuid.v4();
  }

  this._eventClients[uuid] = {
    uuid : uuid,
    url : callbackURL,
    date : Date.now(),
    timeoutSecond : timeoutSecond
  };

  // response.setHeader("Server", this.device.serverName);
  response.setHeader("TIMEOUT", "Second-" + timeoutSecond);
  response.setHeader("Content-Length", "0");
  response.setHeader("SID", "uuid:" + uuid);
  response.end();

  logger.info("Subscribe: Client uuid=", uuid, " url=", callbackURL);

  return callback(null);
};

Service.prototype.responseSoap = function(response, functionName, body,
    callback) {

  var jxml = {
    _name : "s:Envelope",
    _attrs : {
      xmlns : Xmlns.UPNP_SERVICE,
      "xmlns:s" : Xmlns.SOAP_ENVELOPE,
      "s:encodingStyle" : "http://schemas.xmlsoap.org/soap/encoding/"
    },
    _content : {
      "s:Body" : body
    }
  };

  var xml = jstoxml.toXML(jxml, {
    header : true,
    indent : "",
    filter : xmlFilters
  });

  debug(functionName + ": Response=", xml);

  response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");

  response.end(xml, "utf8");

  return callback(null);
};

Service.prototype.soapError = function(response, error, callback) {

  var err = this.ErrorSoap.soap(error.soapErrorCode);

  this.responseSoap(response, "Error", {
    _name : "s:Fault",
    _content : {
      faultcode : 's:Client',
      faultstring : 'UPnPError',
      detail : {
        _name : 'UPnPError',
        _attrs : {
          'xmlns:e' : 'urn:schemas-upnp-org:control'
        },
        _content : {
          errorCode : err.code,
          errorDescription : err.message
        }
      }
    }
  }, function(error) {
    if (error) {
      debug("Soap error " + err.code + " : " + err.message +
          " not sent reason:" + error);
      return callback(error);
    }

    if (debug.enabled) {
      debug("Soap error " + err.code + " : " + err.message + " sent");
    }
    callback(null);
  });
};

Service.prototype.sendEvent = function(eventName, xmlContent) {
  var eventKey = this._eventKey++;

  // if (debugEvent.enabled) {
  // debugEvent("Send event xmlContent=", xmlContent);
  // }

  var clients = this._eventClients;

  if (!Object.keys(clients).length) {

    var xml2 = jstoxml.toXML(xmlContent, {
      header : true,
      indent : " ",
      filter : xmlFilters
    });

    debugEvent("Send event NO client => ", xml2);

    return;
  }

  var clientsCopy = [];
  for ( var k in clients) {
    clientsCopy.push(clients[k]);
  }

  var xml = jstoxml.toXML(xmlContent, {
    header : true,
    indent : " ",
    filter : xmlFilters
  });

  debugEvent("Send event ", xml, " to " + clientsCopy.length + " clients");

  var self = this;
  Async.eachLimit(clientsCopy, EVENT_CLIENTS_PROCESSOR_LIMIT, function(client,
      callback) {
    if (client.deleted || !client.url) {
      callback();
      return;
    }

    client._callback = callback;

    var url = URL.parse(client.url);

    try {
      var req = http.request({
        hostname : url.hostname,
        port : url.port,
        method : "NOTIFY",
        path : url.path,
        headers : {
          server : self.device.serverName,
          "Content-Type" : "text/xml; charset=\"utf-8\"",
          NT : "upnp:event",
          NTS : eventName,
          SEQ : eventKey,
          SID : "uuid:" + client.uuid
        }
      });

      req.on("error",
          function(e) {
            logger.error(
                "ERROR: Client '" + client.url + "' remove from list.", e);

            client.deleted = true;

            var cb = client._callback;
            if (cb) {
              client._callback = undefined;
              setImmediate(cb);
            }
          });

      req.write(xml);
      req.end(function() {

        var cb = client._callback;
        if (cb) {
          client._callback = undefined;
          setImmediate(cb);
        }
      });

    } catch (x) {
      logger.error("Can not send http request", x);

      client.deleted = true;

      var cb = client._callback;
      if (cb) {
        client._callback = undefined;
        setImmediate(cb);
      }
    }
  });
};

Service.prototype.makeEvent = function(xmlProps) {

  var xmlContent = {
    _name : "e:propertyset",
    _attrs : {
      xmlns : Xmlns.UPNP_SERVICE,
      "xmlns:e" : Xmlns.UPNP_EVENT,
      "xmlns:dt" : Xmlns.MICROSOFT_DATATYPES,
      "xmlns:s" : this.type
    },
    _content : xmlProps
  };

  this.sendEvent("upnp:propchange", xmlContent);
};

Service.prototype.childValue = function(xml, name, xmlns) {
  var self = this;
  var child = xml.childNamed(name);
  if (child) {
    return child.val;
  }

  var found, node;
  xml.eachChild(function(c) {
    node = self.childValue.call(self, c, name);
    if (node != undefined) {
      found = node;
      return false;
    }
  });

  return found;
};

Service.prototype.childrensValue = function(xml, name, xmlns, list) {
  var self = this;
  if (!list){
    list = [];
  }
  var childrens = xml.childrenNamed(name);
  if (childrens) {
    childrens.forEach(function(child){
      list.push(child.val);
      });
    return list;
  }

  xml.eachChild(function(c) {
    self.childrensValue.call(self, c, name, list);
  });

  return list;
};



Service._childNamed = function childNamed(xml, name, xmlns) {
  var child = xml.childNamed(name);
  if (child) {
    return child;
  }

  var found, node;
  xml.eachChild(function(c) {
    node = childNamed(c, name);
    if (node) {
      found = node;
      return false;
    }
  });

  return found;
};
