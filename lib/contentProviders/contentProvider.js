/*jslint node: true */
"use strict";

function ContentProvider(API, parameters) {
  this.API = API;
  this.parameters = parameters;
}

module.exports = ContentProvider;

ContentProvider.prototype.init = function(callback) {
  return callback(null);
};

/*
 * CAUTION !!!! This function must return a list of COMPLETE URL, not only the filename
 * 
 */
ContentProvider.prototype.list = function(url, callback) {

};

/*
 * CAUTION !!!! Stat must have a file 'mime' which contains the mime type of the resource
 * 
 */
ContentProvider.prototype.stat = function(url, callback) {

};

ContentProvider.prototype.createReadStream = function(url, start, end, callback) {

};
