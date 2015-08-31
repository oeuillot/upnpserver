/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";
/*
 * ConnectionManager Soap Errors
 */

var ErrorSoap = {
  401 : "Invalid Action",
  402 : "Invalid Args",
  404 : "Invalid Var",
  501 : "Action Failed",
  600 : "Argument Value Invalid",
  601 : "Argument Value Out of Range",
  602 : "Optional Action Not Implemented",
  604 : "Human Intervention Required",
  605 : "String Argument Too Long",
  701 : "Incompatible protocol info",
  702 : "Incompatible directions",
  703 : "Insufficient network resources",
  704 : "Local restrictions",
  705 : "Access denied",
  706 : "Invalid connection reference",
  707 : "Not in network"
};

ErrorSoap.soap = function(code) {
  code = code || 500;
  var msg = this[code] || 'Unknown error';
  var err = new Error(msg);
  err.code = code;
  return err;
};

module.exports = ErrorSoap;
