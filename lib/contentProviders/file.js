var Util = require('util');
var Mime = require('mime');
var ContentProvider = require('./contentProvider');

function FileContentProvider(API, parameters) {
  ContentProvider.call(this, API, parameters);
}

Util.inherits(FileContentProvider, ContentProvider);

module.exports = FileContentProvider;

ContentProvider.prototype.list = function(url, callback) {

  fs.readdir(url, function(error, files) {
    if (error) {
      return callback(error);
    }

    for (var i = 0; i < path.length; i++) {
      files[i] = path + Path.sep + files[i];
    }

    return callback(null, files);
  });
};

ContentProvider.prototype.getMetaData = function(path, callback) {
  fs.stat(path, function(error, stats) {
    if (error) {
      return callback(error);
    }

    if (stats.isDirectory()) {
      stats.mime = DIRECTORY_MIME_TYPE;

      return callback(null, stats);
    }

    var mime = Mime.lookup(path, "");
    stats.mime = mime;

    return callback(null, stats);
  });
};

ContentProvider.prototype.getStream = function(url, callback) {
  try {
    stream = fs.createReadStream(url);

    return callback(null, stream);

  } catch (x) {
    logger.error("Can not access to " + url, x);

    return callback(x);
  }
};

ContentProvider.prototype.processRequest = function(request, response, path,
    callback) {

  
};
