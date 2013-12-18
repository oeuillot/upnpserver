var Repository = require('./repository');
var Util = require('util');
var async = require('async');
var fs = require('fs');
var Path = require('path');
var Mime = require('mime');
var Item = require('./item');

var PathRepository = function(mountPath, path, searchClasses) {
	Repository.call(this, mountPath);

	this.directoryPath = path;

};

Util.inherits(PathRepository, Repository);

module.exports = PathRepository;

// <Filter>@id,@parentID,@childCount,dc:title,dc:date,res,res@protocolInfo,res@size,sec:CaptionInfoEx</Filter>

PathRepository.prototype.browse = function(list, item, callback) {
	var itemPath = item.getItemPath();
	var path = itemPath.substring(this.mountPath.length);

	path = this.directoryPath + path.replace(/\//g, Path.sep);

	console.log("PathRepository: browse=", itemPath, " path=", path);

	var self = this;
	fs.readdir(path, function(error, files) {
		if (error) {
			if (error.code == "ENOENT") {
				// Ca peut être un dossier virtuel !

				console.log("PathRepository: ENOENT for " + path);

				return callback(null);
			}

			console.log("PathRepository: Error for " + path, error);
			return callback(error);
		}

		console.log("PathRepository: path " + path + " returns " + files.length
				+ " files");

		async.mapLimit(files, 4, function(file, callback) {

			var p = path + Path.sep + file;
			fs.stat(p, function(error, stats) {
				if (error) {
					console.log("Stat error for ", p, error);
					return callback(null); // Access problem ...
				}

				if (stats.isDirectory()) {
					return self.addDirectory(item, p, stats, callback);
				}

				if (stats.isFile()) {
					var mime = Mime.lookup(Path.extname(p).substring(1), "");
					stats.mime = mime;

					return self.addFile(item, p, stats, callback);
				}

				console.log("Unsupported file '" + p + "' ", stats);
				callback(null);
			});

		}, function(error, list) {
			if (error) {
				return callback(error);
			}

			console
					.log("PathRepository: END browse=", itemPath, " path=",
							path);

			callback(null, list);
		});
	});
};

PathRepository.prototype.addDirectory = function(parent, p, stats, callback) {
	return this.contentDirectoryService.newFolder(parent, p, stats, callback);
};

PathRepository.prototype.addFile = function(parent, p, stats, callback) {

	var mime = stats.mime;
	var idx = mime.indexOf('/');
	if (idx > 0) {
		mime = mime.substring(0, idx);
	}

	var upnpClass = null;

	switch (mime) {
	case "video":
		upnpClass = Item.VIDEO_FILE;
		break;

	case "audio":
		upnpClass = Item.AUDIO_FILE;
		break;

	case "image":
		upnpClass = Item.IMAGE_FILE;
		break;
	}

	// console.log("New file '" + p + "' => " + upnpClass);

	if (!upnpClass) {
		return callback(null);
	}

	return this.contentDirectoryService.newFile(parent, p, upnpClass, stats,
			callback);
};
