var  AVTransportService = function(configuration) {


  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, {
    serviceType : "urn:schemas-upnp-org:service:AVTransport",
    serviceId : "urn:upnp-org:serviceId:AVTransport",
    lastChangeXmlns : {
      "xmlns:avt-event":"urn:schemas-upnp-org:metadata-1-0/AVT_RCS"
    },
    route: "avt"
  }, configuration);

  var self = this;

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
  this.addAction('GetMediaInfo_Ext', [{
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

  this.addType("A_ARG_TYPE_InstanceID", "ui4", configuration.InstanceID || 0);
  this.addType("LastChange", "string", "", [], null, true, 0.2);
  this.addType("TransportState", "string", "STOPPED",
      ["STOPPED", "PLAYING" ].join(','), null, 2);
  this.addType("TransportStatus", "string", "OK",
      ["OK", "ERROR OCCURED" ].join(','), null, 2);
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
  this.addType("TransportPlaySpeed", "ui4", 1, [], null, 2);
  this.addType("RecordMediumWriteStatus", "string", "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("CurrentRecordQualityMode", "string", "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("PossibleRecordQualityModes", "string", "NOT_IMPLEMENTED",
      [], null, 2);
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
      ["Play","Stop","Pause","Seek","Next","Previous"].join(","), null, 2);
  this.addType("RelativeTimePosition", "string", "00:00:00");
  this.addType("AbsoluteTimePosition", "string", "00:00:00");
  this.addType("RelativeCounterPosition", "ui4", 0);
  this.addType("AbsoluteCounterPosition", "ui4", 0);
  this.addType("A_ARG_TYPE_UpdateID", "ui4", 0);
  this.addType("A_ARG_TYPE_SeekMode", "string", "TRACK_NR",
      ["TRACK_NR","REL_TIME"].join(","));
  this.addType("A_ARG_TYPE_SeekTarget", "string", "");

  // AVT 2/3.x spec
  if (this.version > 2){

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

    this.addType("CurrentMediaCategory", "string", "TRACK_AWARE",
        ["TRACK_AWARE","NO_MEDIA"].join(","));
    this.addType("A_ARG_TYPE_ServiceType", "string", "AVTransport:3");
    this.addType("A_ARG_TYPE_StateVariableValuePairs", "string", "");
    this.addType("A_ARG_TYPE_StateVariableList", "string", "");
    this.addType("A_ARG_TYPE_PlaylistData", "string", "");
    this.addType("A_ARG_TYPE_PlaylistDataLength", "ui4", 0);
    this.addType("A_ARG_TYPE_PlaylistOffset", "ui4", 0);
    this.addType("A_ARG_TYPE_PlaylistTotalLength", "ui4", 0);
    this.addType("A_ARG_TYPE_PlaylistMIMEType", "string", "");
    this.addType("A_ARG_TYPE_PlaylistExtendedType", "string", "");
    this.addType("A_ARG_TYPE_PlaylistInfo", "string", "", {
      "xmlns:rpl":"urn:schemas-upnp-org:av:rpl"
    });
    this.addType("A_ARG_TYPE_PlaylistType", "string", "Static");
    this.addType("A_ARG_TYPE_PlaylistStartObjID", "string", "");

  }

  return this;
}
Util.inherits(AVTransportService, Service);
module.exports = AVTransportService;

AVTransportService.prototype.play = function(){

  this.emit("play");

}

AVTransportService.prototype.stop = function(){

  this.emit("stop");

}

AVTransportService.prototype.pause = function(){

  this.emit("pause");

}

AVTransportService.prototype.playNext = function(witch){

  this.play();

}

AVTransportService.prototype.seek = function(target){

  this.play();

}

AVTransportService.prototype.responseSoap_Actions = function(action, response, callback){

  this.responseSoap(
          response,
          action,
          {
            _name : "u:" + action + "Response",
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
              debug("AVT: " + action + " end ");
            }
            callback(null);
          });

}

AVTransportService.prototype.processSoap_Seek = function(xml, request,
    response, callback) {
  var self = this;
  var target = self._childNamed(xml, "Target", Service.UPNP_SERVICE_XMLNS);
  var unit   = self._childNamed(xml, "Unit", Service.UPNP_SERVICE_XMLNS);

  if (target){
    switch (unit){
      case 'REL_TIME':{
        this.stateVars["TransportState"].set('TRANSITIONING');
        this.once('play', function(){
            self.stateVars["TransportState"].set('PLAYING');
            self.responseSoap_Actions('Seek', response, callback);
          });
          this.seek(target)
      } break;
      case 'TRACK_NR':{
        var current = this.stateVars["CurrentTrack"].get();
        var delta   = parseInt(target)-current;
        this.stateVars["TransportState"].set('TRANSITIONING');
        this.once('play', function(){
            self.stateVars["TransportState"].set('PLAYING');
            self.responseSoap_Actions('Seek', response, callback);
        });
        this.playNext(delta);

        } break;
      default:
        return callback(600, "Invalid Seek Unit");
    }
  }
  return callback(600, "Invalid Seek Target");

}

AVTransportService.prototype.processSoap_Play = function(xml, request,
    response, callback) {
      var self = this;

      this.stateVars["TransportState"].set('TRANSITIONING');

      this.once('play', function(){
        self.stateVars["TransportState"].set('PLAYING');
        self.responseSoap_Actions("Play", response, callback);
      });
      this.play();
}

AVTransportService.prototype.processSoap_Stop = function(xml, request,
    response, callback) {
      var self = this;

      this.stateVars["TransportState"].set('TRANSITIONING');

      this.once('stop', function(){
        self.stateVars["TransportState"].set('STOPPED');
        self.responseSoap_Actions("Stop", response, callback);
      });
      this.stop();
}

AVTransportService.prototype.processSoap_Pause = function(xml, request,
    response, callback) {
      var self = this;

      this.stateVars["TransportState"].set('TRANSITIONING');

      this.once('pause', function(){
        self.stateVars["TransportState"].set('PAUSED_PLAYBACK');
        self.responseSoap_Actions("Pause", response, callback);
      });
      this.pause();
}

AVTransportService.prototype.processSoap_Next = function(xml, request,
    response, callback) {
      var self = this;

      this.stateVars["TransportState"].set('TRANSITIONING');

      this.once('play', function(){
        self.stateVars["TransportState"].set('PLAYING');
        self.responseSoap_Actions("Next", response, callback);
      });
      this.playNext(1);
}

AVTransportService.prototype.processSoap_Previous = function(xml, request,
    response, callback) {
      var self = this;

      this.stateVars["TransportState"].set('TRANSITIONING');

      this.once('play', function(){
        self.stateVars["TransportState"].set('PLAYING');
        self.responseSoap_Actions("Previous", response, callback);
      });
      this.playNext(-1);
}

AVTransportService.prototype.processSoap_SetNextAVTransportURI = function(xml, request,
    response, callback) {
    var self = this;
    var media = self._childNamed(xml, "NextURI", Service.UPNP_SERVICE_XMLNS);
    var meta  = self._childNamed(xml, "NextURIMetaData", Service.UPNP_SERVICE_XMLNS);

    // remove dlna from url (hdhomerun), escape $ (ps3 media server)
    media = media.replace(/\?dlna/g,'').replace(/\$/g,'%24');

    // playlist url or single item
    this.stateVars["NextAVTransportURI"].set(media);
    this.stateVars["NextAVTransportURIMetaData"].set(meta);

    this.responseSoap_Actions("SetNextAVTransportURI", response, callback);
}
AVTransportService.prototype.processSoap_SetAVTransportURI = function(xml, request,
    response, callback) {

    var self = this;
    var media = self._childNamed(xml, "CurrentURI", Service.UPNP_SERVICE_XMLNS);
    var meta  = self._childNamed(xml, "CurrentURIMetaData", Service.UPNP_SERVICE_XMLNS);

    // remove dlna from url (hdhomerun), escape $ (ps3 media server)
    media = media.replace(/\?dlna/g,'').replace(/\$/g,'%24');

    if (!media) return callback(400, "SetAVTransportURI without media");

    instance.PlayListInfo('static', 'Idle');

    // playlistContainer -> empty CurrentURI
    var state   =  this.stateVars["TransportState"].get();
    if (state == 'PAUSED_PLAYBACK'){
      this.stateVars["TransportState"].set('STOPPED');
      }

    // playlist url or single item
    this.stateVars["AVTransportURI"].set(media);
    this.stateVars["AVTransportURIMetaData"].set(meta);

    // AVT 1.x playlist
    // meta is a m3u file
    if (/m3u/.test(meta)){

      // AvTransport:1
      // download playlist content
      // unaware of metadata
      var mimetype = 'audio/m3u',
        extended = '*';

      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      instance.PlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      // retrieve playlist
      var req = http.request(media, function(res){
        if (res.statusCode > 399){
          return cb(Error.http(res.statusCode, 'clientHttp ' + res.statusCode));
        }
        var m3u ="";
        res.setEncoding('utf-8');	// !!! m3u are iso encoded; m3u8 are utf8
        res.on('data', function(chunk){	m3u+=chunk;});
        res.on('end', function(){
        //	instance.rawPlayList = body;
          return self.parseM3u(instance, m3u, 'SetAVTransportURI', cb);
          });
        });
      req.on('error', function(err) {
        cb(Error.create("clientHttps request error ",err));
        });
      req.end();

      }
    else if (/text\/xml/.test(meta)){
      // an xml playlist file is submitted to AVT
      var mimetype = 'text/xml',
        extended = '*';
      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      instance.PlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      // download and parse playlist
      var req = http.request(media, function(res){
        if (res.statusCode > 399){
          return cb(Error.http(res.statusCode, 'clientHttp ' + res.statusCode));
        }
        var body ="";
        res.setEncoding('utf-8');
        res.on('data', function(chunk){	body+=chunk;});
        res.on('end', function(){
          // body should be xml
          return self.parseMeta(instance, body, 'SetAVTransportURI', cb);
          });
        });
      req.on('error', function(err) {
        cb(Error.create("clientHttps request error ",err));
        });
      req.end();

    }
    else {
      var mimetype = 'text/xml',
        extended = '*';
      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      instance.PlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      return self.parseMeta(instance, meta, 'SetAVTransportURI', cb);
    }
    this.responseSoap_Actions('SetAVTransportURI', response, callback)
}

//  Fisher-Yates shuffle algorithm.
function shuffle(array) {
  var cur = array.length
	, tmp
	, rnd;

  // While there remain elements to shuffle...
  while (0 !== cur) {

	// Pick a remaining element...
	rnd = Math.floor(Math.random() * cur);
	cur -= 1;

	// And swap it with the current element.
	tmp = array[cur];
	array[cur] = array[rnd];
	array[rnd] = tmp;
  }

  return array;
}


AVTransportService.prototype.lastChange = function(stateVar){

  var self = this;

  var InstanceID = self.stateVars["A_ARG_TYPE_InstanceID"].get();
  // find instance 0 and use the LastChange var on this instance
  var route = self.route;
  var index = route.indexOf(InstanceID);
  if (index > -1) {
    route = route.substr(0, index-1);
  }
  var LastChange = self.device.services[route].stateVars["LastChange"];
  var lastJXML = LastChange.get();
  if (!lastJXML){
    lastJXML = {
     _name:"Event",
     _attr:self.lastChangeXmlns,
     _content : []
   };
  }
  var _content = lastJXML._content;
  // find if there is an event prop set for this instance
  var instance;
  var len = _content.length;
  for (var i = 0; i < len; i++){
    if (_content[i]._attrs["val"] == InstanceID){
      instance = _content[i]._content;
      break;
    }
  }
  if (!instance){
    var newinstance = {
      _name: "InstanceID",
      _attrs: {val:InstanceID},
      _content : []
    };
    instance = newinstance._content;
    _content.push(instance);
  }
  // update value of prop if there is an event prop allready set
  var found = false;
  var len = instance.length;
  for (var i=0; i < len; i++){
    if (instance[i].name == stateVar.name){
      found = true;
      instance[i]._attrs["val"] = stateVar.value;
      break;
    }
  }
  if (!found){
    instance.push({
      _name : stateVar.name,
      _attrs : {val: stateVar.value},
    })
  }

  LastChange.set(lastJXML);
}
