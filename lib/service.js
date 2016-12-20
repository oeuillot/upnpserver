/*jslint node: true, esversion: 6 */
"use strict";

const http = require('http');
const URL = require('url');
const util = require('util');

const Async = require('async');
const jstoxml = require('jstoxml');
const Uuid = require('uuid');
const xmldoc = require('./util/xmldoc');

const AsyncEventEmitter = require('./util/asyncEventEmitter');
const ErrorSoap = require('./util/errorSoap');
const logger = require('./logger');
const xmlFilters = require("./util/xmlFilters");
const StateVar = require("./stateVar");
const Xmlns = require('./xmlns');

const debug = require('debug')('upnpserver:service');
const debugEvent = require('debug')('upnpserver:service:event');

const EVENT_CLIENTS_PROCESSOR_LIMIT = 4;

const DEFAULT_TIMEOUT_SECOND = 60 * 30;
const TIMEOUT_SECOND_MAX = 60 * 60 * 2;

class Service extends AsyncEventEmitter {
	constructor(configuration) {
		super();

		this.type = configuration.serviceType;
		this.id = configuration.serviceId;
		this.route = configuration.route;
		this.stateVars = {};
		this.stateActions = {};

		this._serviceJXML = {
			_name: "service",
			_content: {
				serviceType: configuration.serviceType,
				serviceId: configuration.serviceId,
				SCPDURL: "/" + this.route + "/scpd.xml",
				controlURL: "/" + this.route + "/control",
				eventSubURL: "/" + this.route + "/event"
			}
		};

		this._descJXML = {
			_name: "scpd",
			_attrs: {
				xmlns: Xmlns.UPNP_SERVICE
			},
			_content: {
				specVersion: {
					major: 1,
					minor: 0
				},
				actionList: [],
				serviceStateTable: []
			}
		};

		this._eventClients = {};
		this._eventKey = Date.now();
	}


	initialize(upnpServer, callback) {
		this.upnpServer = upnpServer;

		return callback(null, this);
	}

	serviceToJXml() {
		return this._serviceJXML;
	}

	descToJXml() {
		return this._descJXML;
	}

	addAction(name, inParameters, outParameters) {

		// Handle simple Get stateActions automatically and when no handler are found
		if (name.indexOf("Get") === 0 && !inParameters.length && !this["processSoap_" + name]) {
			this.stateActions[name] = outParameters;
		}

		var action = {
			_name: "action",
			_content: {
				name: name,
				argumentList: []
			}
		};

		if (inParameters) {
			inParameters.forEach((p) => {
				action._content.argumentList.push({
					_name: "argument",
					_content: {
						name: p.name,
						direction: "in",
						relatedStateVariable: p.type
					}
				});
			});
		}

		if (outParameters) {
			outParameters.forEach((p) => {
				action._content.argumentList.push({
					_name: "argument",
					_content: {
						name: p.name,
						direction: "out",
						relatedStateVariable: p.type
					}
				});
			});
		}

		this._descJXML._content.actionList.push(action);
	}

	addType(name, type, value, valueList, ns, evented,
					moderation_rate, additionalProps, preEventCb, postEventCb) {

		this.stateVars[name] = new StateVar(this, name, type, value, ns, evented,
			moderation_rate, additionalProps, preEventCb, postEventCb);

		var r = {
			_name: "stateVariable",
			_attrs: {
				sendEvents: (evented) ? "yes" : "no"
			},
			_content: {
				name: name,
				dataType: type
			}
		};
		if (valueList && valueList.length) {
			var allowedValueList = valueList.map((v) => ({_name: "allowedValue", _content: v}));

			r._content.allowedValueList = allowedValueList;
		}

		this._descJXML._content.serviceStateTable.push(r);
	}

	/**
	 *
	 */
	processRequest(request, response, path, callback) {

		var reg = /([^\/]+)(\/.*)?/.exec(path);
		if (!reg) {
			return callback("Invalid path (" + path + ")");
		}
		var segment = reg[1];
		// var action = reg[2];

		switch (segment) {
			case "scpd.xml":
				this.processScpdRequest(request, response, (error) => callback(error, true));
				return;

			case "control":
				this.processControlRequest(request, response, (error) => {
					if (error) {
						this.soapError(response, error, (err) => {
							if (err) {
								logger.error("Can't send soapError response", err);
							}

							callback(null, true);
						});
						return;
					}
					callback(null, true);
				});
				return;

			case "event":
				return this.processEventRequest(request, response, (error) => callback(error, true));
		}

		debug("processRequest", "Unknown request path=", path);
		callback(null, false);
	}

	processScpdRequest(request, response, callback) {
		var xml = jstoxml.toXML(this._descJXML, {
			header: true,
			indent: " ",
			filter: xmlFilters
		});
		// logger.debug("SCPD: Response=", xml);
		response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
		response.end(xml, "UTF-8");

		debug("processScpdRequest", "SCDP request returns", xml);

		return callback(null, true);
	}

	processControlRequest(request, response, callback) {

		var soapAction = request.headers.soapaction;

		debug("processControlRequest", "Control: soapAction=", soapAction, "headers=", request.headers);

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
		request.on('data', (data) => body += data);

		request.on('end', () => {
			var xml = new xmldoc.XmlDocument(body);

			debug("processControlRequest", "Request body=", body, " xml=", xml);

			fn.call(this, xml, request, response, (soapErrorCode, error) => {
				if (error) {
					debug("processControlRequest", "Can not process soap action=", soapAction);

					error = {
						soapAction: soapAction,
						soapErrorCode: soapErrorCode,
						error: error,
						xml: xml
					};

					callback(error);
					return;
				}

				debug("processControlRequest", "Call of soap action", soapAction, "finished.");

				callback(null);
			});
		});
	}

	processEventRequest(request, response, callback) {

		debug("processEventRequest", "process", request.method, "from", request.connection.remoteAddress, "service=", this.type);

		if (request.method == "SUBSCRIBE") {
			return this.processSubscribe(request, response, callback);
		}

		if (request.method == "UNSUBSCRIBE") {
			return this.processUnsubscribe(request, response, callback);
		}

		var error = new Error("Invalid request method " + request.method);
		logger.error(error, error.x);
		callback(error);
	}

	processUnsubscribe(request, response, callback) {
		var sid = request.headers.sid;

		if (!sid) {
			var err0 = new Error("Invalid unsubscribe request sid parameter");
			return callback(err0, true);
		}

		var idx = sid.indexOf(':');
		if (idx < 0) {
			var err1 = new Error("Invalid unsubscribe request sid parameter '" + sid + "'");
			return callback(err1, true);
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

		debug("processUnsubscribe", "Unsubscribe: Delete client uuid=", uuid, " url=", client.url);

		callback(null, true);
	}

	processSubscribe(request, response, callback) {
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
				timeoutSecond = parseInt(result2[1], 10);

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
			uuid: uuid,
			url: callbackURL,
			date: Date.now(),
			timeoutSecond: timeoutSecond
		};

		// response.setHeader("Server", this.upnpServer.serverName);
		response.setHeader("TIMEOUT", "Second-" + timeoutSecond);
		response.setHeader("Content-Length", "0");
		response.setHeader("SID", "uuid:" + uuid);
		response.end();

		debug("processSubscribe", "Subscribe: Client uuid=", uuid);

		callback(null);
	}

	/**
	 * Generic state actions handler
	 */
	processSoap_Get(xml, request, response, callback) {

		var stateAction = request.headers.soapaction;

		var req = /^[\"]?[^#]+#([^"]+)[\"]?$/.exec(stateAction);
		if (req) {
			stateAction = req[1];
		}

		debug("processSoap_Get", "stateAction=", stateAction);

		// s-l : handle vars xmlns
		var xmlns = {
			"xmlns:u": this.type
		};

		var _content = {};
		this.stateActions[stateAction].forEach((out) => {
			_content[out.name] = this.stateVars[out.type].get();
			// s-l : handle vars xmlns
			if (this.stateVars[out.type].ns) {
				for (var ns in this.stateVars[out.type].ns) {
					xmlns["xmlns:" + ns] = this.stateVars[out.type].ns[ns];
				}
			}
		});

		this.responseSoap(response, stateAction, {
			_name: "u:" + stateAction + "Response",
			_attrs: xmlns,
			_content: _content
		}, callback);
	}

	/**
	 *
	 */
	responseSoap(response, functionName, body, callback) {

		var jxml = {
			_name: "s:Envelope",
			_attrs: {
				xmlns: Xmlns.UPNP_SERVICE,
				"xmlns:s": Xmlns.SOAP_ENVELOPE,
				"s:encodingStyle": "http://schemas.xmlsoap.org/soap/encoding/"
			},
			_content: {
				"s:Body": body
			}
		};

		var xml = jstoxml.toXML(jxml, {
			header: true,
			indent: "",
			filter: xmlFilters
		});

		debug("responseSoap", "function=", functionName, "response=", xml);

		response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");

		response.end(xml, "utf8");

		callback(null);
	}

	soapError(response, error, callback) {

		var err = ErrorSoap.soap(error.soapErrorCode);

		this.responseSoap(response, "Error", {
			_name: "s:Fault",
			_content: {
				faultcode: 's:Client',
				faultstring: 'UPnPError',
				detail: {
					_name: 'UPnPError',
					_attrs: {
						'xmlns:e': 'urn:schemas-upnp-org:control'
					},
					_content: {
						errorCode: err.code,
						errorDescription: err.message
					}
				}
			}
		}, (error) => {
			if (error) {
				logger.error("soapError", "Error code=", err.code, "message=", err.message,
					"not sent reason=", error);
				return callback(error);
			}

			debug("soapError", "error=", err.code, "message=", err.message, "sent !");
			callback(null);
		});
	}

	sendEvent(eventName, xmlContent) {
		var eventKey = this._eventKey++;

		// if (debugEvent.enabled) {
		// debugEvent("Send event xmlContent=", xmlContent);
		// }

		var clients = this._eventClients;

		if (!Object.keys(clients).length) {

			if (debugEvent.enabled) {
				let xml2 = jstoxml.toXML(xmlContent, {
					header: true,
					indent: " ",
					filter: xmlFilters
				});

				debugEvent("sendEvent", "Send event NO client => ", xml2);
			}

			return;
		}

		var clientsCopy = [];
		let toDelete = [];
		for (var k in clients) {
			let cl = clients[k];
			if (cl.deleted || !cl.url) {
				toDelete.push(k);
				continue;
			}

			clientsCopy.push(cl);
		}
		toDelete.forEach((k) => delete clients[k]);

		var xml = jstoxml.toXML(xmlContent, {
			header: true,
			indent: " ",
			filter: xmlFilters
		});

		debugEvent("sendEvent", "send", xml, "to", clientsCopy.length, "clients");

		Async.eachLimit(clientsCopy, EVENT_CLIENTS_PROCESSOR_LIMIT, (client, callback) => {
			if (client.deleted || !client.url) {
				callback();
				return;
			}

			var url = URL.parse(client.url);

			var done = false;
			try {
				var req = http.request({
					hostname: url.hostname,
					port: url.port,
					method: "NOTIFY",
					path: url.path,
					headers: {
						server: this.upnpServer.serverName,
						"Content-Type": "text/xml; charset=\"utf-8\"",
						NT: "upnp:event",
						NTS: eventName,
						SEQ: eventKey,
						SID: "uuid:" + client.uuid
					}
				});

				req.on("error", (e) => {
					if (!client.deleted) {
						logger.error("ERROR: Remove client '" + client.url + "' from list. [ServiceId=" + this.id + "]", e);

						client.deleted = true;
					}

					if (done) {
						return;
					}
					done = true;
					callback();
				});

				req.write(xml);
				req.end(() => {
					if (done) {
						return;
					}
					done = true;
					callback();
				});

			} catch (x) {
				logger.error("Can not send http request [ServiceId=" + this.id + "]", x, x.stack);

				client.deleted = true;

				if (!done) {
					done = true;
					callback();
				}
			}
		});
	}

	makeEvent(xmlProps) {

		var xmlContent = {
			_name: "e:propertyset",
			_attrs: {
				xmlns: Xmlns.UPNP_SERVICE,
				"xmlns:e": Xmlns.UPNP_EVENT,
				"xmlns:dt": Xmlns.MICROSOFT_DATATYPES,
				"xmlns:s": this.type
			},
			_content: xmlProps
		};

		this.sendEvent("upnp:propchange", xmlContent);
	}

	static _childNamed(xml, name, xmlns) {
		var child = xml.childNamed(name);
		if (child) {
			return child;
		}

		var found, node;
		xml.eachChild((c) => {
			node = Service._childNamed(c, name);
			if (node) {
				found = node;
				return false;
			}
		});

		return found;
	}
}

module.exports = Service;
