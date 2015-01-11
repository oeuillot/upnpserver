function ContentProvider(API, parameters) {
  this.API = API;
  this.parameters = parameters;
}

modules.exports = ContentProvider;

ContentProvider.prototype.init = function(callback) {
  return callback(null);
};

ContentProvider.prototype.list = function(url, callback) {

};

ContentProvider.prototype.getMetaData = function(url, callback) {

};

ContentProvider.prototype.getStream = function(url, callback) {

};

ContentProvider.prototype.processRequest = function(request, response, url,
    callback) {

};
