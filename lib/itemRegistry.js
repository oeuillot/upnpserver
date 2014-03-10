/*jslint node: true, nomen: true */
"use strict";

var Registry = function () {

};

module.exports = Registry;

Registry.prototype.initialize = function (callback) {
	this._dbMap = {};

	return callback(null);
};

Registry.prototype.clear = function (callback) {
	this._dbMap = {};

	return callback(null);
};

Registry.prototype.registerItem = function (item, callback) {
	this._dbMap[item.itemId] = item;

	return callback(null, item);
};

Registry.prototype.getItemById = function (id, callback) {
	var item = this._dbMap[id];

	return callback(null, item);

};
