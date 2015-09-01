/*jslint node: true, plusplus:true, nomen: true, vars: true */
"use strict";
/*
 * AVTransport v3 Soap Errors
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
  701 : "Transition not available",
  702 : "No contents",
  703 : "Read error",
  704 : "Format not supported for playback",
  705 : "Transport is locked",
  706 : "Write error",
  707 : "Media is protected or not writable",
  708 : "Format not supported for recording",
  709 : "Media is full",
  710 : "Seek mode not supported",
  711 : "Illegal seek target",
  712 : "Play mode not supported",
  713 : "Record quality not supported",
  714 : "Illegal MIME-type",
  715 : "Content ‘BUSY’",
  716 : "Resource not found",
  717 : "Play speed not supported",
  718 : "Invalid InstanceID",
  719 : "DRM error",
  720 : "Expired content",
  721 : "Non-allowed use",
  722 : "Can't determine allowed uses",
  723 : "Exhausted allowed use",
  724 : "Device authentication failure",
  725 : "Device revocation",
  726 : "Invalid StateVariableList",
  727 : "Not well formed CSV list",
  728 : "Invalid State Variable Value",
  729 : "Invalid Service Type",
  730 : "Invalid service Id",
  731 : "Invalid time, offset, or position value",
  732 : "Unable to calculate sync point",
  733 : "Sync, position, or offset too early or small",
  734 : "Illegal PlaylistOffset",
  735 : "Incorrect Playlist Length",
  736 : "Illegal playlist",
  737 : "No DNS Server",
  738 : "Bad Domain Name",
  739 : "Server Error"
};

ErrorSoap.soap = function(code) {
  code = code || 500;
  var msg = this[code] || 'Unknown error';
  var err = new Error(msg);
  err.code = code;
  return err;
};

module.exports = ErrorSoap;
