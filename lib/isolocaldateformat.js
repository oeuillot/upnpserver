/*jslint node: true */
"use strict";

(function () {
	var buffer = new Buffer('yyyy-mm-ddTHH:MM:SS'),
		ISOLocalDateFormat = {};

	function formatValue(pos, width, val) {
		var i, digit;
		for (i = width - 1; i >= 0; i -= 1) {
			digit = val % 10;
			buffer[pos + i] = 0x30 + digit;
			val = (val - digit) / 10;
		}
	}

	ISOLocalDateFormat.format = function (dt) {
		formatValue(0, 4, dt.getFullYear());
		formatValue(5, 2, dt.getMonth() + 1);
		formatValue(8, 2, dt.getDate());
		formatValue(11, 2, dt.getHours());
		formatValue(14, 2, dt.getMinutes());
		formatValue(17, 2, dt.getSeconds());
		return buffer.toString();
	};

	if (typeof exports !== 'undefined') {
		// Node.js
		exports.ISOLocalDateFormat = ISOLocalDateFormat;
	}
}());
