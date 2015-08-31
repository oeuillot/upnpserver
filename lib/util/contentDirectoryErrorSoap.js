/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";
/*
 * ContentDirectory Soap Errors
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
  701 : "No such object",
  702 : "Invalid currentTagValue",
  703 : "Invalid newTagValue",
  704 : "Required tag",
  705 : "Read only tag",
  706 : "Parameter Mismatch",
  708 : "Unsupported or invalid search criteria",
  709 : "Unsupported or invalid sort criteria",
  710 : "No such container",
  711 : "Restricted object",
  712 : "Bad metadata",
  713 : "Restricted parent object",
  714 : "No such source resource",
  715 : "Resource access denied",
  716 : "Transfer busy",
  717 : "No such file transfer",
  718 : "No such destination resource",
  719 : "Destination resource access denied",
  720 : "Cannot process the request"
};

ErrorSoap.soap = function(code) {
  code = code || 500;
  var msg = this[code] || 'Unknown error';
  var err = new Error(msg);
  err.code = code;
  return err;
};

module.exports = ErrorSoap;
