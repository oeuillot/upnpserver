/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";

var URL = require('url');
var http = require('http');

var jstoxml = require('jstoxml');
var xmldoc = require('xmldoc');
var Async = require('async');
var Uuid = require('node-uuid');

var logger = require('./logger');
var xmlFilters = require("./xmlFilters").xmlFilters;

var EVENT_CLIENTS_PROCESSOR_LIMIT = 4;

var DEFAULT_TIMEOUT_SECOND = 60 * 30;
var TIMEOUT_SECOND_MAX = 60 * 60 * 2;

var Service = function(properties) {

  this.type = properties.serviceType;
  this.id = properties.serviceId;
  this.scpdURL = properties.scpdURL;
  this.controlURL = properties.controlURL;
  this.eventSubURL = properties.eventSubURL;

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
      xmlns : "urn:schemas-upnp-org:service-1-0"
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

Service.prototype.addType = function(name, sendEvents, type, valueList) {
  var r = {
    _name : "stateVariable",
    _attrs : {
      sendEvents : (sendEvents)
          ? "yes" : "no"
    },
    _content : {
      name : name,
      dataType : type
    }
  };
  if (valueList) {
    r._content.allowedValueList = [];
    valueList.forEach(function(v) {
      r._content.allowedValueList.push({
        _name : "allowedValue",
        _content : v
      });
    });
  }

  this._descJXML._content.serviceStateTable.push(r);
};

Service.prototype.processRequest = function(request, response, path, callback) {
  if (path === this.scpdURL) {
    return this.processScpdRequest(request, response, path, function(error) {
      callback(error, true);
    });
  }

  if (path === this.controlURL) {
    return this.processControlRequest(request, response, path, function(error) {
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

  // logger.debug("Control: soapAction=", soapAction, "
  // headers=",request.headers);

  if (!soapAction) {
    return callback("processControlRequest: No soap action !");
  }

  if (soapAction.charAt(0) === '\"' &&
      soapAction.charAt(soapAction.length - 1) === '\"') {
    soapAction = soapAction.substring(1, soapAction.length - 1);
  }

  var idx = soapAction.indexOf('#');
  if (idx > 0) {
    var type = soapAction.substring(0, idx);
    if (type !== this.type) {
      return callback("processControlRequest: Invalid type '" + type + "' / '" +
          this.type + "' !");
    }
    soapAction = soapAction.substring(idx + 1);
  }

  var als = this._descJXML._content.actionList;

  var fn = null;
  var i;
  for (i = 0; i < als.length; i++) {
    var a = als[i];
    if (a._content.name === soapAction) {
      fn = this["processSoap_" + soapAction];
      break;
    }
  }
  if (!fn) {
    return callback("processControlRequest: Unknown soap function 'processSoap_" +
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

    fn.call(self, xml, request, response, function(error) {
      if (error) {
        return callback("processControlRequest: Can not process soap action '" +
            soapAction + "': ");
      }

      logger.debug("Call of soap action '" + soapAction + "': finished");

      callback(null);
    });
  });
};

Service.prototype.processEventRequest = function(request, response, path,
    callback) {

  // console.log("Process event request ", request);

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
    var result = /^Second\-([0-9]+)$/.exec(timeoutHeader);
    if (result && result.length) {
      timeoutSecond = result[1];
    } else if (timeoutHeader == "infinite") {
      timeoutSecond = TIMEOUT_SECOND_MAX;
    }
  }

  // console.log("Header=", request.headers);

  var uuid = null;
  var sid = request.headers.sid;
  if (sid) {
    var result = /uuid:(.*)+$/.exec(sid);
    if (result && result.length) {
      uuid = result[1];

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

Service.prototype.responseSoap = function(response, functionName, body,
    callback) {

  var jxml = {
    _name : "s:Envelope",
    _attrs : {
      xmlns : "urn:schemas-upnp-org:service-1-0",
      "xmlns:s" : "http://schemas.xmlsoap.org/soap/envelope/",
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

  // logger.debug(functionName + ": Response=", xml);

  response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");

  response.end(xml, "utf8");

  return callback(null);
};

Service.prototype.sendEvent = function(eventName, xmlContent) {
  var eventKey = this._eventKey++;

  // logger.debug("Send event xmlContent=", xmlContent);

  var clients = this._eventClients;

  if (!Object.keys(clients).length) {
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

  // logger.info("Send event ", xml, " to " + clientsCopy.length + " clients");

  var self = this;
  Async.eachLimit(clientsCopy, EVENT_CLIENTS_PROCESSOR_LIMIT, function(client,
      callback) {
    if (client.deleted || !client.url) {
      return;
    }

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

      req.write(xml);
      req.end();
    } catch (x) {
      logger.error("Can not send http request", x);
    }
  });

};