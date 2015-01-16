var mysql = require('mysql');

var MysqlRegistry = function() {

};

module.exports = MysqlRegistry;

MysqlRegistry.prototype.initialize = function(service, callback) {
  var connection = mysql.createConnection({
    host : 'example.org',
    user : 'bob',
    password : 'secret'
  });

};

MysqlRegistry.prototype.registerNode = function(item, callback) {

  return callback(null, item);
};

MysqlRegistry.prototype.getNodeById = function(id, callback) {

  return callback(null, item);

};
