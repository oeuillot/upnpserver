var Repository = require('./repository');
var Util = require('util');
var async = require('async');
var fs = require('fs');
var Path = require('path');
var Mime = require('mime');
var Item = require('./item');
var Async = require('async');

var FILES_PROCESSOR_LIMIT = 4;
var FOLDER_SCAN_LIMIT = 4;
var DIRECTORY_SCAN_LIMIT = 2;

var ScannerRepository = function(mountPath, path) {
	Repository.call(this, mountPath);

	this.directoryPath = path;
};

Util.inherits(ScannerRepository, Repository);

module.exports = ScannerRepository;

ScannerRepository.prototype.initialize = function(service, callback) {
	var self = this;
	Repository.prototype.initialize.call(this, service, function(error, item) {
		if (error) {
			return callback(error);
		}

		process.nextTick(function() {
			var files = [];
			self._scanDirectory(item, files, self.directoryPath,
					function(error) {
						if (error) {
							console.error("Scan directory error", error);
							return;
						}

						console.log("Number of files to process: "
								+ files.length);

						Async.eachLimit(files, FILES_PROCESSOR_LIMIT, function(
								infos, callback) {

							self.processFile(item, infos, function(error) {
								if (error) {
									console.error("Process file itemId="
											+ item.itemId + " infos=", infos,
											" error=", error);
								}

								callback(null);
							});

						}, function(error) {
							if (error) {
								console.error("Error while scaning files ",
										error);
								return;
							}

							console.log(files.length + " files processed");
						});
					});
		});

		callback(null, item);
	});
};

ScannerRepository.prototype.browse = function(list, item, callback) {
	return callback(null);
};

ScannerRepository.prototype._scanDirectory = function(rootItem, files,
		rootPath, callback) {

	// console.log("List directory ", rootPath);

	var self = this;
	fs.readdir(rootPath, function(error, list) {
		if (error) {
			console.log("Error while reading directory ", path);
			return callback(null);
		}

		var directories = [];
		Async.eachLimit(list, FOLDER_SCAN_LIMIT, function(path, callback) {

			var p = rootPath + Path.sep + path;
			fs.stat(p, function(error, stats) {
				if (error) {
					console.log("Error while stat ", p, error);
					return callback(null, list);
				}

				// console.log("Scan item ", p);

				if (stats.isDirectory()) {
					directories.push(p);
					return callback(null);
				}

				if (stats.isFile()) {
					// Faire un scannerRepository pour filtrer des fichiers

					var infos = {
						path : p,
						stats : stats
					};
					if (self.keepFile(infos)) {
						// console.log("Keep file ", p);
						files.push(infos);
					}

					return callback(null);
				}

				callback(null);
			});

		}, function(error) {
			if (error) {
				console.log("Reduce error", error);
				return callback(error);
			}

			if (!directories.length) {
				return callback(null);
			}

			Async.eachLimit(directories, DIRECTORY_SCAN_LIMIT, function(
					directory, callback) {
				self._scanDirectory(rootItem, files, directory, callback);

			}, callback);
		});

	});
};

ScannerRepository.prototype.keepFile = function(infos) {
	return false;
};

ScannerRepository.prototype.processFile = function(rootItem, infos, callback) {
	callback("Nothing to process ?");
};
