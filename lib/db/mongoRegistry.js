var Mongoose = require('mongoose');

var MongooseRegistry = function() {
	Mongoose.connect('mongodb://localhost/upnpserver');

};

module.exports = MongooseRegistry;

MongooseRegistry.prototype.initialize = function(service, callback) {
	var db = Mongoose.connection;
	db.on('error', function() {
		callback('connection error');
	});

	db.once('open', function() {
		return callback(null);
	});
};

MongooseRegistry.prototype.registerNode = function(item, callback) {

	return callback(null, item);
};

MongooseRegistry.prototype.getNodeById = function(id, callback) {

	return callback(null, item);

};
