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
var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;
var StateVar = require("./stateVar");

var ErrorSoap = require('./util/errorSoap');
var debug = require('debug')('upnpserver:service');
var debugEvent = require('debug')('upnpserver:service:event');
require('./util/errorSoap');

var EVENT_CLIENTS_PROCESSOR_LIMIT = 4;

var DEFAULT_TIMEOUT_SECOND = 60 * 30;
var TIMEOUT_SECOND_MAX = 60 * 60 * 2;

var Service = function(properties) {
  AsyncEventEmitter.call(this);

  this.type = properties.serviceType;
  this.id = properties.serviceId;
  this.scpdURL = properties.scpdURL;
  this.controlURL =  properties.controlURL;
  this.eventSubURL = properties.eventSubURL;

  this.stateVars = {};
  this.stateActions = {};

  this._serviceJXML = {
    _name : "service",
    _content : {
      serviceType : properties.serviceType,
      serviceId : properties.serviceId,
      SCPDURL : properties.scpdURL,
      controlURL : properties.controlURL,
      eventSubURL : properties.eventSubURL
    }
  };

  this._descJXML = {
    _name : "scpd",
    _attrs : {
      xmlns : Service.UPNP_SERVICE_XMLNS
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

Service.UPNP_SERVICE_XMLNS = "urn:schemas-upnp-org:service-1-0";
Service.UPNP_DEVICE_XMLNS = "urn:schemas-upnp-org:device-1-0";
Service.UPNP_EVENT_XMLNS = "urn:schemas-upnp-org:event-1-0";
Service.UPNP_METADATA_XMLNS = "urn:schemas-upnp-org:metadata-1-0/upnp/";
Service.SOAP_ENVELOPE_XMLNS = "http://schemas.xmlsoap.org/soap/envelope/";
Service.MICROSOFT_DATATYPES_XMLNS = "urn:schemas-microsoft-com:datatypes";

Service.prototype.initialize = function(upnpServer, callback) {
  this.upnpServer = upnpServer;

  return callback(null, this);
};

Service.prototype.serviceToJXml = function() {
  return this._serviceJXML;
};

Service.prototype.descToJXml = function() {
  return this._descJXML;
};

Service.prototype.addAction = function(name, inParameters, outParameters) {

  // Handle simple Get stateActions automatically and when no handler are found
  if (name.indexOf("Get") === 0 && !inParameters.length && !this["processSoap_"+name]) {
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
      sendEvents : (evented) ? "yes" : "no"
    },
    _content : {
      name : name,
      dataType : type
    }
  };
  if (valueList) {
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
  if (path === this.scpdURL) {
    return this.processScpdRequest(request, response, path, function(error) {
      callback(error, true);
    });
  }

  if (path === this.controlURL) {
    return this.processControlRequest(request, response, path, function(code,
        error) {
      if (code) {
        self.soapError(response, code, function(err) {
          logger.error("Can't send soapError response");
        });
      }
      callback(error, true);
    });
  }
  if (path === this.eventSubURL) {
    return this.processEventRequest(request, response, path, function(error) {
      callback(error, true);
    });
  }
  // logger.debug("Unknown request url '" + path + "'");
  return callback(null, false);
};

Service.prototype.processScpdRequest = function(request, response, path,
    callback) {
  var xml = jstoxml.toXML(this._descJXML, {
    header : true,
    indent : " ",
    filter : xmlFilters
  });
  // logger.debug("SCPD: Response=", xml);
  response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
  response.end(xml, "UTF-8");

  return callback(null, true);
};

Service.prototype.processControlRequest = function(request, response, path,
    callback) {

  var soapAction = request.headers.soapaction;

  debug("Control: soapAction=", soapAction, "headers=", request.headers);

  if (!soapAction) {
    return callback(501, "processControlRequest: No soap action !");
  }

  if (soapAction.charAt(0) === '\"' &&
      soapAction.charAt(soapAction.length - 1) === '\"') {
    soapAction = soapAction.substring(1, soapAction.length - 1);
  }

  var idx = soapAction.indexOf('#');
  if (idx > 0) {
    var type = soapAction.substring(0, idx);
    if (type !== this.type) {
      return callback(401, "processControlRequest: Invalid type '" + type +
          "' / '" + this.type + "' !");
    }
    soapAction = soapAction.substring(idx + 1);
  }

  var als = this._descJXML._content.actionList;

  var fn = null;
  var i;
  for (i = 0; i < als.length; i++) {
    var a = als[i];
    if (a._content.name === soapAction) {
      // generic Get soapAction
      if (soapAction in this.stateActions) {
        soapAction = "Get";
      }

      fn = this["processSoap_" + soapAction];
      break;
    }
  }
  if (!fn) {
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

    // logger.debug("Call body=", body);

    fn.call(self, xml, request, response, function(code, error) {
      if (error) {

        debug("processControlRequest: Can not process soap action '" +
            soapAction + "': ");

        error = {
          soapAction : soapAction,
          error : error,
          xml : xml
        };

        callback(code, error);
        return;
      }

      debug("Call of soap action '" + soapAction + "': finished");

      callback(null);
    });
  });
};

Service.prototype.processEventRequest = function(request, response, path,
    callback) {

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

  // response.setHeader("Server", this.upnpServer.serverName);
  response.setHeader("TIMEOUT", "Second-" + timeoutSecond);
  response.setHeader("Content-Length", "0");
  response.setHeader("SID", "uuid:" + uuid);
  response.end();

  logger.info("Subscribe: Client uuid=", uuid, " url=", callbackURL);

  return callback(null);
};
/**
 * Generic state actions handler
 */
Service.prototype.processSoap_Get = function(xml, request, response, callback) {

  var self = this;

  var stateAction = request.headers.soapaction;

  var req = /^[\"]?[^#]+#([^"]+)[\"]?$/.exec(stateAction);
  if (req) {
    stateAction = req[1];
  }

  if (debug.enabled) {
    debug("Soap.Get: " + stateAction);
    // , Object.keys(self.stateActions).length);
  }

  // s-l : handle vars xmlns
  var xmlns = {
    "xmlns:u" : this.type
  };

  var _content = {};
  this.stateActions[stateAction].forEach(function(out) {
    _content[out.name] = self.stateVars[out.type].get();
    // s-l : handle vars xmlns
    if (self.stateVars[out.type].ns){
      for (var ns in self.stateVars[out.type].ns){
        xmlns[ns] = self.stateVars[out.type].ns[ns];
      }
    }
  });

  this.responseSoap(response, stateAction, {
    _name : "u:" + stateAction + "Response",
    _attrs : xmlns,
    _content : _content
  }, callback);
};

Service.prototype.responseSoap = function(response, functionName, body,
    callback) {

  var jxml = {
    _name : "s:Envelope",
    _attrs : {
      xmlns : Service.UPNP_SERVICE_XMLNS,
      "xmlns:s" : Service.SOAP_ENVELOPE_XMLNS,
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

Service.prototype.soapError = function(response, code, callback) {

  var err = ErrorSoap.soap(code);

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
    debug("Soap error " + err.code + " : " + err.message + " sent");
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
          server : self.upnpServer.serverName,
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
      xmlns : Service.UPNP_SERVICE_XMLNS,
      "xmlns:e" : Service.UPNP_EVENT_XMLNS,
      "xmlns:dt" : Service.MICROSOFT_DATATYPES_XMLNS,
      "xmlns:s" : this.type
    },
    _content : xmlProps
  };

  this.sendEvent("upnp:propchange", xmlContent);
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
