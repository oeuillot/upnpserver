/*jslint node: true, sub:true */
"use strict";

var Util = require('util');
var path = require('path');
var http = require('http');
var jstoxml = require('jstoxml');
var xmldoc = require('./util/xmldoc');
var Service = require("./service");
var Xmlns = require('./xmlns');
var debug = require('debug')('service:avTransport');

var  AVTransportService = function(device, classPrefix, configuration) {


  // NOTE: stateVars:evented in instance context define whenever the var is
  // advertised with LastChange event on subscription (evented = 2)

  Service.call(this, device, classPrefix, {
    serviceType : "urn:schemas-upnp-org:service:AVTransport",
    serviceId : "urn:upnp-org:serviceId:AVTransport",
    route: "avt"
  }, configuration);

  var self = this;

  // AVT 1.x spec
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
      name:'CurrentTransportState',
      type:'TransportState'
    },{
      name:'CurrentTransportStatus',
      type:'TransportStatus'
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
  this.addAction('GetCurrentTransportActions', [{
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

  this.addType("A_ARG_TYPE_InstanceID", "ui4", 718, configuration.InstanceID || 0);
  this.addType("LastChange", "string", 600, "", [], {"xmlns:avt-event":"urn:schemas-upnp-org:metadata-1-0/AVT/"}, true, 0.2);
  this.addType("TransportState", "string", 600,"STOPPED",
      ["STOPPED", "PLAYING" ], null, 2);
  this.addType("TransportStatus", "string",600, "OK",
      ["OK", "ERROR OCCURED" ], null, 2);
  this.addType("PlaybackStorageMedium", "string",600,  "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("RecordStorageMedium", "string",600,  "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("PossiblePlaybackStorageMedia", "string",600,  "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("PossibleRecordStorageMedia", "string",600,  "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("CurrentPlayMode", "string",712 ,"SHUFFLE",
      ["SHUFFLE","REPEAT_ONE","REPEAT_ALL","RANDOM","DIRECT_1","INTRO"],
      null, 2);
  this.addType("TransportPlaySpeed", "ui4",717, 1, [], null, 2);
  this.addType("RecordMediumWriteStatus", "string",600, "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("CurrentRecordQualityMode",713, "string", "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("PossibleRecordQualityModes",713, "string", "NOT_IMPLEMENTED",
      [], null, 2);
  this.addType("CurrentMediaCategory", "string",600, "NO_MEDIA",
    ["NO_MEDIA", "TRACK_AWARE", "TRACK_UNAWARE"], null, 2);
  this.addType("NumberOfTracks", "ui4",600, 0, [],null, 2);
  this.addType("CurrentTrack", "ui4",600, 0, [],null, 2);
  this.addType("CurrentTrackDuration", "string",600, "0", [],null, 2);
  this.addType("CurrentMediaDuration", "string",600, "0", [],null, 2);
  this.addType("CurrentTrackMetaData", "string",600, "", [],null, 2);
  this.addType("CurrentTrackURI", "string",600, "", [],null, 2);
  this.addType("AVTransportURI", "string", 600, "", [],null, 2);
  this.addType("AVTransportURIMetaData", "string", 600, "", [],null, 2);
  this.addType("NextAVTransportURI", "string", 600, "", [],null, 2);
  this.addType("NextAVTransportURIMetaData", "string",600,  "", [],null, 2);
  this.addType("CurrentTransportActions", "string",600, "",
      ["Play","Stop","Pause","Seek","Next","Previous"], null, 2);
  this.addType("RelativeTimePosition", "string",600, "00:00:00");
  this.addType("AbsoluteTimePosition", "string",600, "00:00:00");
  this.addType("RelativeCounterPosition", "ui4",600, 0);
  this.addType("AbsoluteCounterPosition", "ui4",600, 0);
  this.addType("A_ARG_TYPE_UpdateID", "ui4",600, 0);
  this.addType("A_ARG_TYPE_SeekMode", "string", 710, "TRACK_NR",
      ["TRACK_NR","REL_TIME"]);
  this.addType("A_ARG_TYPE_SeekTarget","string", 711, "");

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

    this.addType("CurrentMediaCategory", "string", 600, "TRACK_AWARE",
        ["TRACK_AWARE","NO_MEDIA"]);
    this.addType("A_ARG_TYPE_ServiceType", "string",600,  "AVTransport:3");
    this.addType("A_ARG_TYPE_StateVariableValuePairs", "string",728,  "");
    this.addType("A_ARG_TYPE_StateVariableList", "string",726, "");
    this.addType("A_ARG_TYPE_PlaylistData", "string",736, "");
    this.addType("A_ARG_TYPE_PlaylistDataLength", "ui4",735, 0);
    this.addType("A_ARG_TYPE_PlaylistOffset", "ui4",734, 0);
    this.addType("A_ARG_TYPE_PlaylistTotalLength", "ui4",735, 0);
    this.addType("A_ARG_TYPE_PlaylistMIMEType", "string",714, "");
    this.addType("A_ARG_TYPE_PlaylistExtendedType", "string",714, "");
    this.addType("A_ARG_TYPE_PlaylistInfo", "string",714, "", {
      "xmlns:rpl":"urn:schemas-upnp-org:av:rpl"
    });
    this.addType("A_ARG_TYPE_PlaylistType", "string",600, "Static");
    this.addType("A_ARG_TYPE_PlaylistStartObjID", "string",734, "");

  }

  this.playlist      = [];  // array of didl items
  this.rawPlaylist   = "";  // xml string form
  this.playlistState = "Idle";

  return this;
}
Util.inherits(AVTransportService, Service);
module.exports = AVTransportService;

/**
 *  NOTE:
 *  Single track are playlist with one entry.
 *
 */
AVTransportService.prototype.buildPlayListInfo	= function(type, state, format){
	var self = this
  , playlistAllowedFormats = [{
    _name:contentType,
    _attrs:{
      MIMEType:"text/xml",
      extendedType:"*"
      }
    },{
    _name:contentType,
    _attrs:{
      MIMEType:"text/xml",
      extendedType:"DLNA.ORG_PN=DIDL_V"
      }
    },{
    _name:contentType,
    _attrs:{
      MIMEType:"audio/m3u",
      extendedType:"*"
      }
    }]
	,	playlistCurrentFormat = []
  ;
/*
      if (self.playlistState != 'Idle' && format) {
        playlistCurrentFormat.push({
          _name:contentType,
          _attrs:{
            MIMEType:"text/xml",
            extendedType:"*"
            }
          });
      }
      var Jxml = {
          _name:type + 'PlaylistInfo',
          _attrs:{
            "xmlns":"urn:schemas-upnp-org:av:rpl",
            "xmlns:xsd":"http://www.w3.org/2001/XMLSchema"
          },
          _content:[
            playlistState:state,
            playlistChunkLengthMax:10240,
            playlistTotalLengthMax:524288,
            {
              _name:"playlistCurrentFormat",
              _content:playlistCurrentFormat
            },
            {
              _name:"playlistAllowedFormats",
              _content:playlistAllowedFormats
            },
            {
              _name:"playlistContents",
              _attrs:{
                currentObjID:"0"  // item playing now  for streaming playlist:currentTrack
              },
              _content:self.rawPlayList
            }
          ],
        };
      self.playlistState = state;
    	switch (state){
    		case 'Idle':
    		case 'Incomplete':{
    			self.rawPlayList = '';
    			}
    			break;
    		case 'Ready':{
    		self.Shuffle();
    		self.absStart();
    		var playMode = self.stateVars["CurrentPlayMode"].get();
    		switch (playMode){
    			case 'SHUFFLE_NOREPEAT':
    			case 'SHUFFLE':{
    				var pl = self.shuffle_indexes.map(function(i){
    					return self.playlist[i];
    					});
    				self.rawPlayList = DIDL.toXML(pl);
    				pl = [];
    				} break;
    			default:{
    				self.rawPlayList = DIDL.toXML(self.playlist);
    				}
    			}
    		// didl should be escaped
    		self.rawPlayList = XMLParser.prototype.escape(self.rawPlayList);
    		}
    	}
      var xml = jstoxml.toXML(Jxml {
        header : true,
        indent : " ",
        filter : xmlFilters
      });
    	self.stateVars["A_ARG_TYPE_PlaylistInfo"].set(PlaylistInfo);
 */
}

AVTransportService.prototype._newDidlJxml = function() {

  var xmlDidl = {
    _name : "DIDL-Lite",
    _attrs : {}
  };

  var attrs = xmlDidl._attrs;

  attrs["xmlns"] = Xmlns.DIDL_LITE;
  attrs["xmlns:dc"] = Xmlns.PURL_ELEMENT;
  attrs["xmlns:upnp"] = Xmlns.UPNP_METADATA;

  if (this.dlnaSupport) {
    attrs["xmlns:dlna"] = Xmlns.DLNA_METADATA;
  }

  if (this.jasminFileMetadatasSupport) {
    attrs["xmlns:fm"] = Xmlns.JASMIN_FILEMETADATA;
  }

  if (this.jasminMusicMetadatasSupport) {
    attrs["xmlns:mm"] = Xmlns.JASMIN_MUSICMETADATA;
  }

  if (this.secDlnaSupport) {
    attrs["xmlns:sec"] = Xmlns.SEC_DLNA_XMLNS;
  }

  return xmlDidl;
};

AVTransportService.prototype.parseM3u 				= function(m3u, action, response, callback){
  /*
	var	self = this
	,	Jxml = []
	,	list = m3u.split('\n')
	,	title
	,	j = 0
	;
  for (var i in list){
		var line = list[i];
		if (/^#EXTINF[:\t\s]*(.*)/.test(line)){
			title = line.match(/^#EXTINF[:\t\s]*(.*)/)[1];
			}
		if (!/(^#.*|^[\s\t]+#.*)/.test(line)){
			var filepath = url.parse(line);
			title = title ? title : path.basename(filepath.pathname);
			var ext   = path.extname(filepath.pathname);
			if (/^\.[\w]+/.test(ext)){
				ext = ext.slice(1);
				}
			else ext = 'mp3';
			res.push({
          _name : "item",
          _attrs : {
            id : j,
            parentID : 0,
            restricted : "0"
          },
          _content : {
            'dc:title':title,
            'upnp:class':'object.item.audioTrack'
          }
        });
        {
        res:[{
          protocolInfo:'http-get:*:audio/'+ext+':*',
          uri:line,
          duration:'00:00:00',
          absStart:0
         }],
        container:{
          id:j,
          parentID:0
        },
        item:{
          'dc:title':title,
          'upnp:class':'object.item.audioTrack'
        }
      });
			title = null;
			j+=1;
			}
		}
	this.playlist = res;
	this.stateVars["CurrentMediaDuration"].set('00:00:00');
	this.stateVars["NumberOfTracks"].set(this.playlist.length);
	// this.setCurrent(this.playlist[0], 0);
	this.buildPlayListInfo('static', 'Ready', {mime:'audio/m3u', extended:'*'});
	this.stateVars["TransportState"].set(self.lastTransportState);
  */
  callback(null);
	}

AVTransportService.prototype.parseMeta				= function(raw, action, response, callback){
	var self = this;

	// fix unescaped chars in xml
	// DAMNED! TODO : understand how they can still be here since they are escaped by DIDL.toXML()
	// raw = raw.replace(/&/g, '&amp;').replace(/'/g, '&apos;');

  var xml = new xmldoc.XmlDocument(body);

  console.log(util.inspect(xml));

  /*
  xmlns:dc="http://purl.org/dc/elements/1.1/" \
  xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" \
  xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" \
  xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/

  DIDL_XMLNS
  */

  /*
	// parse DIDL-Lite
	// get uri + metadata
	// set instance playlist items
	if (err) {
		console.log('illegal playlist parseXML error:'+err);
    return callback(736,'illegal playlist (failed syntaxic or semantic checks)');
	}
	var didl = self.childValue(xml, "DIDL-Lite", Xmlns.DIDL_LITE);
	if (didl){
		this.playlist = DIDL.toMedia(didl);
		var duration = this.playlist.reduce(function(ttl, cur){
			return ttl + parseTime(cur.res[0].duration);
			},0);
		var mediaDuration = timeToString(duration);
		this.stateVars["CurrentMediaDuration"].set(mediaDuration);
		this.stateVars["NumberOfTracks"].set(this.playlist.length);
		this.setCurrent(this.playlist[0], 0);
	}
	else {
		console.log(' illegal playlist (failed syntaxic or semantic checks)');
		return callback(736,'illegal playlist (failed syntaxic or semantic checks)');
	}

	this.buildPlayListInfo('static','Ready', {mime:'text/xml', extended:'*'});
	this.stateVars["TransportState"].set(self.lastTransportState);
  */
	this.responseSoap_Actions(action, response, callback);


	}

AVTransportService.prototype.parseDidl        = function(meta){

  var xml  = new xmldoc.XmlDocument(meta);

  return xml;
  //console.log("Didl:%s",Util.inspect(didl, {depth:15}));
  //console.log("xml:%s",Util.inspect(xml, {depth:15}));

}

AVTransportService.prototype.play = function(){

  var uri  = this.stateVars["AVTransportURI"].get();
  var meta = this.stateVars["AVTransportURIMetaData"].get();
  var track= 1;
  var duration = "00:00:00";

  if (meta){
    var xml  = this.parseDidl(meta);
    var res = Service._childNamed(xml, "res", Xmlns.DIDL_LITE);
    if (res && res.attr && res.attr.duration){
      duration = res.attr.duration.value;
    }
  }

  this.stateVars["TransportState"].set('TRANSITIONING');

  this.emit("play", uri, function(){

    this.stateVars["CurrentTrack"].set(track);
    this.stateVars["CurrentTrackURI"].set(uri);
    this.stateVars["CurrentTrackMetaData"].set(meta);
    this.stateVars["CurrentTrackDuration"].set(duration);

    this.stateVars["TransportState"].set('PLAYING');

    this.emit("playing");

  }.bind(this));

}

AVTransportService.prototype.stop = function(){

  this.stateVars["TransportState"].set('TRANSITIONING');

  this.emit("stop", function(){

    this.stateVars["TransportState"].set('STOPPED');

    this.emit("stopped");

  }.bind(this));

}

AVTransportService.prototype.pause = function(){

  this.stateVars["TransportState"].set('TRANSITIONING');

  this.emit("pause", function(){

    this.stateVars["TransportState"].set('PAUSED_PLAYBACK');

    this.emit("paused");

  }.bind(this));

}

AVTransportService.prototype.playNext = function(witch){
  // choose a track in current list
  this.play();

}

AVTransportService.prototype.seek = function(target){

  this.play();

}

AVTransportService.prototype.processSoap_SetPlayMode = function(xml, request, callback) {
  var self = this;

  var CurrentPlayMode = this.soapVars["NewPlayMode"];

  this.stateVars["CurrentPlayMode"].set(CurrentPlayMode);

  callback(null);

}

AVTransportService.prototype.processSoap_SetStaticPlaylist= function(xml, request, callback) {
  var self = this;

  var PlaylistOffset        = this.soapVars["PlaylistOffset"]
  ,   PlaylistDataLength    = this.soapVars["PlaylistDataLength"]
  ,   PlaylistTotalLength   = this.soapVars["PlaylistTotalLength"]
  ,   PlaylistData          = this.soapVars["PlaylistData"]
  ,   PlaylistMIMEType      = this.soapVars["PlaylistMIMEType"]
  ,   PlaylistExtendedType  = this.soapVars["PlaylistExtendedType"]
  ;

  // partial content, append to current playlist
  if (PlaylistOffset > 0){
    self.rawPlaylist += PlaylistData;
  }
  else {
    self.rawPlaylist = PlaylistData;
  }

  // setStaticPlaylist complete ?
  if (PlaylistOffset + PlaylistDataLength === PlaylistTotalLength){
    // TODO: process static playlist
    
    return;
  }

  callback(null);
}

AVTransportService.prototype.processSoap_Seek = function(xml, request, callback) {
  var self = this;

  var target = this.soapVars["SeekTarget"];
  var unit   = this.soapVars["SeekMode"];

  if (target){
    switch (unit){
      case 'REL_TIME':{
        this.stateVars["TransportState"].set('TRANSITIONING');
        this.once('play', function(){
            self.stateVars["TransportState"].set('PLAYING');
            callback(null);
          });

        return  this.seek(target);

      } break;
      case 'TRACK_NR':{
        var current = this.stateVars["CurrentTrack"].get();
        var delta   = parseInt(target)-current;
        this.stateVars["TransportState"].set('TRANSITIONING');
        this.once('play', function(){
            self.stateVars["TransportState"].set('PLAYING');
            callback(null);
        });

        return this.playNext(delta);

        } break;
      default:
        return callback(710, "Seek mode not supported");
    }
  }

  callback(711, "Illegal Seek Target");

}

AVTransportService.prototype.processSoap_Play = function(xml, request, callback) {
      var self = this;

      this.once('playing', function(){
          callback(null);
      });
      this.play();
}

AVTransportService.prototype.processSoap_Stop = function(xml, request, callback) {
      var self = this;

      this.once('stopped', function(){
        callback(null);
      });
      this.stop();
}

AVTransportService.prototype.processSoap_Pause = function(xml, request, callback) {
      var self = this;

      this.once('paused', function(){
        callback(null);
      });
      this.pause();
}

AVTransportService.prototype.processSoap_Next = function(xml, request, callback) {
      var self = this;

      this.once('playing', function(){
        callback(null);
      });
      this.playNext(1);
}

AVTransportService.prototype.processSoap_Previous = function(xml, request, callback) {
      var self = this;

      this.once('playing', function(){
        callback(null);
      });
      this.playNext(-1);
}

AVTransportService.prototype.processSoap_SetNextAVTransportURI = function(xml, request, callback) {
    var self = this;

    var media = this.soapVars["NextURI"];
    var meta  = this.soapVars["NextURIMetaData"];

    if (!media) {
      callback(402, "SetNextAVTransportURI without media");
      return
    }

    // remove dlna from url (hdhomerun), escape $ (ps3 media server)
    media = media.replace(/\?dlna/g,'').replace(/\$/g,'%24');

    // playlist url or single item
    this.stateVars["NextAVTransportURI"].set(media);
    this.stateVars["NextAVTransportURIMetaData"].set(meta);

    callback(null);

}

AVTransportService.prototype.responseSoap = function(response, functionName, body,
    callback){

      console.log("responseSoap %s body:%s", functionName, Util.inspect(body, {depth:5}));
      Service.prototype.responseSoap.apply(this, arguments);
    }

AVTransportService.prototype.httpRetrieve = function(uri, callback){
  // download and parse playlist
  var req = http.request(uri, function(res){

    if (res.statusCode > 399){
      switch (res.statusCode){
        case 404:
        case 410:
          return callback(739, "Server Error");
        case 502:
          return callback(738, "Bad Domain Name");
        case 503:
          return callback(737, "No DNS Server");
        default:
          return callback(716, "Resource not found");
        }
      }

    var body ="";
    res.setEncoding('utf-8');
    res.on('data', function(chunk){	body+=chunk;});
    res.on('end', function(){
      return callback(null, null, body);
      });
    });
  req.on('error', function(err) {
    return callback(716, "Resource not found");
    });
  req.end();

}
/**
 *
 */
AVTransportService.prototype.processSoap_SetAVTransportURI = function(xml, request, callback) {

    var self = this;
    var media = this.soapVars["CurrentURI"];
    var meta  = this.soapVars["CurrentURIMetaData"];

    if (!media) {
      callback(402, "SetAVTransportURI without media");
      return
    }
    console.log("Media :%s", Util.inspect(media, {depth:5}));

    // remove dlna from url (hdhomerun), escape $ (ps3 media server)
    media = media.replace(/\?dlna/g,'').replace(/\$/g,'%24');

    this.stateVars["AVTransportURI"].set(media);
    this.stateVars["AVTransportURIMetaData"].set(meta);

    // this.buildPlayListInfo('static', 'Idle');

    // playlistContainer -> empty CurrentURI
    var state   =  this.stateVars["TransportState"].get();
    if (state == 'PAUSED_PLAYBACK'){
      this.stateVars["TransportState"].set('STOPPED');
      }

    // playlist url or single item

    // AVT 1.x playlist
    // meta is a m3u file
    if (meta && /m3u/.test(meta)){

      // AvTransport:1
      // download playlist content
      // NOTE : m3u is unaware of metadata

      var mimetype = 'audio/m3u',
        extended = '*';

      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      this.buildPlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      // retrieve playlist
      this.httpRetrieve(media, function(soapErrorCode, error, body){
        if (error) return callback(soapErrorCode, error);
          return self.parseM3u(body, 'SetAVTransportURI', callback);
      });
      return;
    }
    else if (meta && /text\/xml/.test(meta)){

      // an xml playlist file is submitted to AVT

      var mimetype = 'text/xml',
        extended = '*';
      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      this.buildPlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      this.httpRetrieve(media, function(soapErrorCode, error, body){
        if (error) return callback(soapErrorCode, error);
        return self.parseMeta(body, 'SetAVTransportURI', callback);
      });
      return;
    }
    else {  // single media uri

      this.stateVars["NumberOfTracks"].set(1);

      /*
      var mimetype = 'text/xml',
        extended = '*';
      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      this.buildPlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      return self.parseMeta(meta, 'SetAVTransportURI', callback);
      */
    }
    callback(null);
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
     _content : []
   };
  }

  // console.log(Util.inspect(lastJXML, {depth:5}));

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
    _content.push(newinstance);
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
