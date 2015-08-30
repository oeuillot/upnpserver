var  AVTransportService = function(configuration) {

  var route = "avt";

  // allow different routes for multiple avt instances
  if (configuration.InstanceID) {
    route += "_" + configuration.InstanceID;
  }

  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription

  Service.call(this, {
    serviceType : "urn:schemas-upnp-org:service:AVTransport:3",
    serviceId : "urn:upnp-org:serviceId:AVTransport",
    eventNameSpace : "urn:schemas-upnp-org:metadata-1-0/AVT_RCS"
    route :route
  }, configuration);

  var self = this;

  this.addType("LastChange", "string", "", [], null, true, 0.2);

  this.addType("TransportState", "string", "STOPPED",
      ["STOPPED", "PLAYING" ].join(','),
      null, 2);

  this.addType("TransportStatus", "string", "OK",
      ["OK", "ERROR OCCURED" ].join(','),
      null, 2);

  this.addType("PlaybackStorageMedium", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("RecordStorageMedium", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("PossiblePlaybackStorageMedia", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("PossibleRecordStorageMedia", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("CurrentPlayMode", "string", "SHUFFLE",
      ["SHUFFLE","REPEAT_ONE","REPEAT_ALL","RANDOM","DIRECT_1","INTRO"].join(","),
      null, 2);

  this.addType("TransportPlaySpeed", "ui4", 1,
      [], null, 2);
2
  this.addType("RecordMediumWriteStatus", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("CurrentRecordQualityMode", "string", "NOT_IMPLEMENTED",
      [], null, 2);

  this.addType("PossibleRecordQualityModes", "string", "NOT_IMPLEMENTED",
      [],
      null, 2);

  this.addType("NumberOfTracks", "ui4", 0, [],null, 2);

  this.addType("CurrentTrack", "ui4", 0, [],null, 2);

  this.addType("CurrentTrackDuration", "string", "0", [],null, 2);

  this.addType("CurrentMediaDuration", "string", "0", [],null, 2);

  this.addType("CurrentTrackMetaData", "string", "", [],null, 2);

  this.addType("CurrentTrackURI", "string", "", [],null, 2);

  this.addType("AVTransportURI", "string", "", [],null, 2);

  this.addType("AVTransportURIMetaData", "string", "", [],null, 2);

  this.addType("NextAVTransportURI", "string", "", [],null, 2);

  this.addType("NextAVTransportURIMetaData", "string", "", [],null, 2);

  this.addType("CurrentTransportActions", "string", "",
      ["Play","Stop","Pause","Seek","Next","Previous"].join(","),
      null, 2);

  this.addType("RelativeTimePosition", "string", "00:00:00");

  this.addType("AbsoluteTimePosition", "string", "00:00:00");

  this.addType("RelativeCounterPosition", "ui4", 0);

  this.addType("AbsoluteCounterPosition", "ui4", 0);

  this.addType("A_ARG_TYPE_UpdateID", "ui4", 0);

  this.addType("A_ARG_TYPE_SeekMode", "string", "TRACK_NR",
      ["TRACK_NR","REL_TIME"].join(","));

  this.addType("A_ARG_TYPE_SeekTarget", "string", "");

  this.addType("A_ARG_TYPE_InstanceID", "ui4", 0);

  /* AVT 3.x*/
  this.addType("CurrentMediaCategory", "string", "TRACK_AWARE",
      ["TRACK_AWARE","NO_MEDIA"].join(","));

  this.addType("A_ARG_TYPE_ServiceType", "string", "AVTransport:3");

  	//GetStateVariables() StateVariableValuePairs
  this.addType("A_ARG_TYPE_StateVariableValuePairs", "string", "");

  this.addType("A_ARG_TYPE_StateVariableList", "string", "");

  this.addType("A_ARG_TYPE_PlaylistData", "string", "");

  this.addType("A_ARG_TYPE_PlaylistDataLength", "ui4", 0);

  this.addType("A_ARG_TYPE_PlaylistOffset", "ui4", 0);

  this.addType("A_ARG_TYPE_PlaylistTotalLength", "ui4", 0);

  this.addType("A_ARG_TYPE_PlaylistMIMEType", "string", "");

  this.addType("A_ARG_TYPE_PlaylistExtendedType", "string", "");

  this.addType("A_ARG_TYPE_PlaylistInfo", "string", "");

  this.addType("A_ARG_TYPE_PlaylistType", "string", "Static");

  this.addType("A_ARG_TYPE_PlaylistStartObjID", "string", "");


  // AVT 1.x spec
  this.addAction('SetNextAVTransportURI', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:'NextURI',
    type:'NextAVTransportURI'
  },{
    name:'NextURIMetaData',
    type:'NextAVTransportURIMetaData'
  }],[{
    name:"UpdateID",
    type:"A_ARG_TYPE_UpdateID"
  }]);

  this.addAction('SetAVTransportURI', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:'CurrentURI',
    type:'AVTransportURI'
  },{
    name:'CurrentURIMetaData',
    type:'AVTransportURIMetaData'
  }],[{
    name:"UpdateID",
    type:"A_ARG_TYPE_UpdateID"
  }]);

  this.addAction('GetMediaInfo', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [{
    name:'NrTracks',
    type:'NumberOfTracks'
  },{
    name:'MediaDuration',
    type:'CurrentMediaDuration'
  },{
    name:'CurrentURI',
    type:'AVTransportURI'
  },{
    name:'CurrentURIMetaData',
    type:'AVTransportURIMetaData'
  },{
    name:'NextURI',
    type:'NextAVTransportURI'
  },{
    name:'NextURIMetaData',
    type:'NextAVTransportURIMetaData'
  },{
    name:'PlayMedium',
    type:'PlaybackStorageMedium'
  },{
    name:'RecordMedium',
    type:'RecordStorageMedium'
  },{
    name:'WriteStatus',
    type:'RecordMediumWriteStatus'
  }]);

  this.addAction('GetMediaInfo', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [{
    name:'CurrentType',
    type:'CurrentMediaCategory'
  },{
    name:'NrTracks',
    type:'NumberOfTracks'
  },{
    name:'MediaDuration',
    type:'CurrentMediaDuration'
  },{
    name:'CurrentURI',
    type:'AVTransportURI'
  },{
    name:'CurrentURIMetaData',
    type:'AVTransportURIMetaData'
  },{
    name:'NextURI',
    type:'NextAVTransportURI'
  },{
    name:'NextURIMetaData',
    type:'NextAVTransportURIMetaData'
  },{
    name:'PlayMedium',
    type:'PlaybackStorageMedium'
  },{
    name:'RecordMedium',
    type:'RecordStorageMedium'
  },{
    name:'WriteStatus',
    type:'RecordMediumWriteStatus'
  }]);

  this.addAction('GetTransportInfo', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [{
    name:'TransportState',
    type:'CurrentTransportState'
  },{
    name:'TransportStatus',
    type:'CurrentTransportStatus'
  },{
    name:'CurrentSpeed',
    type:'TransportPlaySpeed'
  }]);

  this.addAction('GetPositionInfo', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [{
    name:'Track',
    type:'CurrentTrack'
  },{
    name:'TrackDuration',
    type:'CurrentTrackDuration'
  },{
    name:'TrackMetaData',
    type:'CurrentTrackMetaData'
  },{
    name:'TrackURI',
    type:'CurrentTrackURI'
  },{
    name:'RelTime',
    type:'RelativeTimePosition'
  },{
    name:'AbsTime',
    type:'AbsoluteTimePosition'
  },{
    name:'RelCount',
    type:'RelativeCounterPosition'
  },{
    name:'AbsCount',
    type:'AbsoluteCounterPosition'
  }]);

  this.addAction("GetCurrentTransportActions", [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "Actions",
    type : "CurrentTransportActions"
  } ]);

  this.addAction('GetDeviceCapabilities', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "PlayMedia",
    type : "PossiblePlaybackStorageMedia"
  },{
    name : "RecMedia",
    type : "PossibleRecordStorageMedia"
  },{
    name : "RecQualityModes",
    type : "PossibleRecordQualityModes"
  }]);

  this.addAction('GetTransportSettings', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "PlayMode",
    type : "CurrentPlayMode"
  },{
    name : "RecQualityMode",
    type : "CurrentRecordQualityMode"
  }]);

  this.addAction('Stop', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);
  this.addAction('Play', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);
  this.addAction('Pause', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);
  this.addAction('Next', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);
  this.addAction('Previous', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);

  this.addAction('Seek', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:"Target",
    type:"A_ARG_TYPE_SeekTarget"
  },{
    name:"Unit",
    type:"A_ARG_TYPE_SeekMode"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);


  // AVT 2/3.x spec
  this.addAction('SetPlayMode', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:"NewPlayMode",
    type:"CurrentPlayMode"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);

  this.addAction('SetStaticPlaylist', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:"PlaylistOffset",
    type:"A_ARG_TYPE_PlaylistOffset"
  },{
    name:"PlaylistDataLength",
    type:"A_ARG_TYPE_PlaylistDataLength"
  },{
    name:"PlaylistTotalLength",
    type:"A_ARG_TYPE_PlaylistTotalLength"
  },{
    name:"PlaylistData",
    type:"A_ARG_TYPE_PlaylistData"
  },{
    name:"PlaylistMIMEType",
    type:"A_ARG_TYPE_PlaylistMIMEType"
  },{
    name:"PlaylistExtendedType",
    type:"A_ARG_TYPE_PlaylistExtendedType"
  }], [ {
    name : "UpdateID",
    type : "A_ARG_TYPE_UpdateID"
  }]);

  this.addAction('GetPlaylistInfo', [{
    name:"InstanceID",
    type:"A_ARG_TYPE_InstanceID"
  },{
    name:"PlaylistType",
    type:"A_ARG_TYPE_PlaylistType"
  }], [ {
    name : "PlaylistInfo",
    type : "A_ARG_TYPE_PlaylistInfo"
  }]);


  if (configuration.InstanceID){
    self.stateVars["A_ARG_TYPE_InstanceID"].set(configuration.InstanceID);
  }

}
Util.inherits(AVTransportService, Service);
module.exports = AVTransportService;


AVTransportService.prototype.processSoap_Play = function(xml, request,
    response, callback) {

      self
          .responseSoap(
              response,
              "Play",
              {
                _name : "u:PlayResponse",
                _attrs : {
                  "xmlns:u" : self.type
                },
                _content : {
                  UpdateID : 0
                }
              }, function(error) {
                if (error) {
                  return callback(501, error);
                }

                if (debug.enabled) {
                  debug("CDS: Play end " + containerId);
                }
                callback(null);
              });


}

AVTransportService.prototype.processSoap_Stop = function(xml, request,
    response, callback) {


}

/*
 * Handle multiple instance id routing
 */
AVTransportService.prototype.getInstance = function(xml){
  var self = this;
  var InstanceID = 0;
  var node = self._childNamed(xml, "InstanceID", Service.UPNP_SERVICE_XMLNS);
  if (node) {
    InstanceID = node.val;
  }
  if (self.device.services[self.route + "_" + InstanceID]){
    return self.device.services[self.route + "_" + InstanceID];
  }
  return this;
}

AVTransportService.prototype.processSoapRequest = function(fn, xml, request, response, callback){

  var scope = this.getInstance(xml);
  Service.prototype.processSoapRequest.call(scope, fn, xml, request, response, callback);

}
