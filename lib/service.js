var jstoxml = require('jstoxml');
var xmldoc = require('xmldoc');

var log = false;

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
			sendEvents : (sendEvents) ? "yes" : "no"
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
	if (path == this.scpdURL) {
		return this.processScpdRequest(request, response, path,
				function(error) {
					callback(error, true);
				});
	}

	if (path == this.controlURL) {
		return this.processControlRequest(request, response, path, function(
				error) {
			callback(error, true);
		});
	}

	console.log("Unknown request url '" + path + "'");
	return callback(null, false);
};

Service.prototype.processScpdRequest = function(request, response, path,
		callback) {
	var xml = jstoxml.toXML(this._descJXML, {
		header : true,
		indent : " "
	});
	console.log("SCPD: Response=", xml);
	response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
	response.end(xml, "UTF-8");

	return callback(null, true);
};

Service.prototype.processControlRequest = function(request, response, path,
		callback) {
	var soapAction = request.headers.soapaction;
	if (log) {
		console.log("Control: soapAction=", soapAction, " headers=",
				request.headers);
	}

	if (!soapAction) {
		return callback("processControlRequest: No soap action !");
	}

	if (soapAction.charAt(0) == '\"'
			&& soapAction.charAt(soapAction.length - 1) == '\"') {
		soapAction = soapAction.substring(1, soapAction.length - 1);
	}

	var idx = soapAction.indexOf('#');
	if (idx > 0) {
		var type = soapAction.substring(0, idx);
		if (type != this.type) {
			return callback("processControlRequest: Invalid type '" + type
					+ "' / '" + this.type + "' !");
		}
		soapAction = soapAction.substring(idx + 1);
	}

	var als = this._descJXML._content.actionList;

	var fn = null;
	for (var i = 0; i < als.length; i++) {
		var a = als[i];
		if (a._content.name != soapAction) {
			continue;
		}

		fn = this["processSoap_" + soapAction];
		break;
	}
	if (!fn) {
		return callback("processControlRequest: Unknown soap function 'processSoap_"
				+ soapAction + "'");
	}

	var body = "";
	request.on('data', function(data) {
		body += data;
	});

	var self = this;
	request
			.on(
					'end',
					function() {
						var xml = new xmldoc.XmlDocument(body);
						if (log) {
							console.log("Call body=", body);
						}

						fn
								.call(
										self,
										xml,
										request,
										response,
										function(error) {
											if (error) {
												return callback("processControlRequest: Can not process soap action '"
														+ soapAction + "': ");
											}

											if (log) {
												console
														.log("Call of soap action '"
																+ soapAction
																+ "': finished");
											}

											callback(null);
										});
					});
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
		indent : " "
	});

	if (log) {
		console.log(functionName + ": Response=", xml);
	}

	response.setHeader("Content-Type", "text/xml; charset=\"utf-8\"");
	response.end(xml, "UTF-8");

	return callback(null);
};
