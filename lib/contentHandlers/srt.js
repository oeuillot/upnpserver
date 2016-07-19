/*jslint node: true, esversion: 6 */
"use strict";

const debug = require('debug')('upnpserver:contentHandlers.Srt');
const logger = require('../logger');

const ContentHandler = require('./contentHandler');

class Srt extends ContentHandler {

	get name() {
		return "srt";
	}

	/**
	 *
	 */
	prepareMetas(contentInfos, context, callback) {

		var contentURL = contentInfos.contentURL;

		var srtBasename = contentURL.basename.replace(/\.[^.]*$/, '.srt'); // TODO Don't use replace !

		var srtURL = contentURL.changeBasename(srtBasename);

		srtURL.stat((error, stats) => {
			if (error) {
				if (error.code === "ENOENT") {
					return callback();
				}

				return callback(error);
			}

			if (stats.isFile() && stats.size > 0) {
				debug("prepareMetas", "SRT detected => url=" + srtURL);

				var res = [{}];
				var metas = {
					res: res
				};

				res.push({
					contentHandlerKey: this.name,
					key: "1",
					type: "srt",
					mimeType: "text/srt",
					size: stats.size,
					mtime: stats.mtime.getTime()
				});

				return callback(null, metas);
			}

			return callback();
		});
	}

	/**
	 *
	 */
	processRequest(node, request, response, path, parameters, callback) {

		var contentURL = node.contentURL;
		var basename = contentURL.basename;
		var srtURL = node.changeBasename(basename.replace(/\.[^.]*$/, '.srt'));

		debug("processRequest", "srtURL=", srtURL, "contentURL=", contentURL);

		this.service.sendContentURL({
			contentURL: srtURL

		}, request, response, callback);
	}
}

module.exports = Srt;
