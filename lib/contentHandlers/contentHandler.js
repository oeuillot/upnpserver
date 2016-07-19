/*jslint node: true, esversion: 6 */
"use strict";

const assert = require('assert');
const fs = require('fs');

const debug = require('debug')('upnpserver:contentHandler');
const logger = require('../logger');

class ContentHandler {

	constructor(configuration) {
		this._configuration = configuration || {};
	}

	get configuration() {
		return this._configuration;
	}

	/**
	 *
	 */
	get service() {
		return this._contentDirectoryService;
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

		var prepareNode = (contentInfos, attributes, callback) => {
			debug("[", this.name, "] PrepareNode event of content", contentInfos);

			this.prepareMetasFromContentURL(contentInfos, attributes, (error) => {
				if (error) {
					logger.error("Prepare node " + contentInfos + " of contentHandler=" + this.name + " error=", error);
					return callback(error);
				}

				debug("[", this.name, "] PrepareNode event END of content", contentInfos);
				callback();
			});
		};


		var toJXML = (node, attributes, request, xml, callback) => {

			debug("[", this.name, "] toJXML event #", node.id);

			this.toJXML(node, attributes, request, xml, callback);
		};


		// Don't use => because we use arguments !
		var browse = (node, callback) => {
			debug("[", this.name, "] browse event #", node.id);

			this.browse(node, callback);
		};

		var priority = this.priority;

		mimeTypes.forEach((mimeType) => {

			if (this.prepareMetas) {
				debug("[", this.name, "] Register 'prepare' for mimeType", mimeType, "priority=", priority);

				contentDirectoryService.asyncOn("prepare:" + mimeType, prepareNode, priority);
			}

			if (this.toJXML) {
				debug("[", this.name, "] Register 'toJXML' for mimeType", mimeType, "priority=", priority);

				contentDirectoryService.asyncOn("toJXML:" + mimeType, toJXML, priority);
			}

			if (this.browse) {
				debug("[", this.name, "] Register 'browse' for mimeType", mimeType, "priority=", priority);

				contentDirectoryService.asyncOn("browse:" + mimeType, browse, priority);
			}
		});

		callback();
	}

	/*
	 * prepareNode(node, callback) { callback(); }
	 */

	searchUpnpClass(fileInfos, callback) {
		callback();
	}

	/**
	 *
	 */
	getResourceByParameter(node, parameter) {
		if (parameter instanceof Array) {
			parameter = parameter[0];
		}

		var res = node.attributes.res || [];

		debug("Find resource by parameter res=", res, "parameter=", parameter);

		return res.find((r) => r.key === parameter);
	}

	/**
	 *
	 */
	sendResource(contentURL, attributes, request, response, callback) {
		debug("[", this.name, "] Send resource contentURL=", contentURL, "attributes=", attributes);

		var opts = {};
		if (attributes._start) {
			opts.start = attributes._start;
			opts.end = opts.start + attributes.size - 1;
		}

		contentURL.createReadStream(null, opts, (error, stream) => {
			if (error) {
				logger.error('No stream for contentURL=', contentURL);

				if (!response.headersSent) {
					response.writeHead(404, 'Stream not found for linked content');
				}
				response.end();
				return callback(null, true);
			}

			if (attributes.mtime) {
				var m = attributes.mtime;
				if (typeof(m) === "number") {
					m = new Date(m);
				}
				response.setHeader('Last-Modified', m.toUTCString());
			}
			if (attributes.contentHash) {
				response.setHeader('ETag', attributes.hash);
			}
			response.setHeader('Content-Length', attributes.size);
			if (attributes.mimeType !== undefined) {
				response.setHeader('Content-Type', "image/jpeg"); //attributes.mimeType);
			}

			stream.pipe(response);

			stream.on('end', () => callback(null, true));
		});

	}

	/**
	 *
	 */
	_mergeMetas(attributes, metas) {

		debug("Merge metas=", metas, "to attributes=", attributes);
		if (!metas) {
			return attributes;
		}

		var copyRes = (index, datas) => {
			attributes.res = attributes.res || [];

			var r = attributes.res[index];
			if (!r) {
				r = {};
				attributes.res[index] = r;
			}

			for (var n in datas) {
				r[n] = datas[n];
			}
		};

		for (var n in metas) {
			var m = metas[n];
			if (n === 'res') {
				for (var i = 0; i < m.length; i++) {
					copyRes(i, m[i]);
				}
				continue;
			}

			var c = attributes[n];
			/*if (false) {
			 // Merge artists, albums ??? (a good or bad idea ?)
			 if (Array.isArray(c) && Array.isArray(m)) {
			 m.forEach((tok) => {
			 if (c.indexOf(tok)>=0) {
			 return;
			 }
			 c.push(tok);
			 });
			 }
			 }*/

			if (c) {
				return;
			}

			attributes[n] = m;
		}

		return attributes;
	}

	/**
	 *
	 */
	prepareMetasFromContentURL(contentInfos, attributes, callback) {
		if (!this.prepareMetas) {
			return callback(null, attributes);
		}

		this.prepareMetas(contentInfos, attributes, (error, metas) => {
			if (error) {
				logger.error("loadMetas error", contentInfos, error);
				// return callback(error); // Continue processing ...
			}

			attributes = this._mergeMetas(attributes, metas);

			callback(null, attributes);
		});
	}
}

module.exports = ContentHandler;
