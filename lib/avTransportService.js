/*jslint node: true, sub:true */
"use strict";

var Util = require('util');
var path = require('path');
var http = require('http');
var jstoxml = require('./util/jstoxml');
var xmldoc = require('./util/xmldoc');
var Service = require("./service");
var Xmlns = require('./xmlns');

var debug      = require('debug')('service:avTransport');
var debugEvent = require('debug')('upnpserver:service:event');
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
  this.addType("LastChange", "string", 600, "",
      [], {"xmlns:avt-event":"urn:schemas-upnp-org:metadata-1-0/AVT/"}, true, 0.2, null, null, function(){
        self.stateVars["LastChange"].value = null;
      });
  this.addType("TransportState", "string", 600,"STOPPED",
      ["STOPPED", "PLAYING", "PAUSED_PLAYBACK" ], null, 2);
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
      },{
        name:"PlaylistStartObjID",
        type:"A_ARG_TYPE_PlaylistStartObjID"
      },{
        name:"PlaylistStartGroupID",
        type:"A_ARG_TYPE_PlaylistStartGroupID"
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
        name : "playlistInfo",  // lowercase :(
        type : "A_ARG_TYPE_PlaylistInfo"
    }]);

    this.addType("CurrentMediaCategory", "string", 600, "TRACK_AWARE",
        ["TRACK_AWARE","NO_MEDIA"]);
    //this.addType("A_ARG_TYPE_ServiceType", "string",600,  "AVTransport:3");
    //this.addType("A_ARG_TYPE_StateVariableValuePairs", "string",728,  "");
    //this.addType("A_ARG_TYPE_StateVariableList", "string",726, "");
    this.addType("A_ARG_TYPE_PlaylistData", "string",736, "");
    this.addType("A_ARG_TYPE_PlaylistDataLength", "ui4",735, -1);
    this.addType("A_ARG_TYPE_PlaylistOffset", "ui4",734, -1);
    this.addType("A_ARG_TYPE_PlaylistTotalLength", "ui4",735, -1);
    this.addType("A_ARG_TYPE_PlaylistMIMEType", "string",714, "");
    this.addType("A_ARG_TYPE_PlaylistExtendedType", "string",714, "");
    this.addType("A_ARG_TYPE_PlaylistInfo", "string",714, "", [],  {
      "xmlns:rpl":"urn:schemas-upnp-org:av:rpl"
    });
    this.addType("A_ARG_TYPE_PlaylistType", "string",600, "Static",
      ["Static","StaticPlContents","Streaming","StreamingPlContents"]);
    this.addType("A_ARG_TYPE_PlaylistStartObjID", "string",734, "0");
    this.addType("A_ARG_TYPE_PlaylistStartGroupID", "string",734, "0");
  }

  this.updateID      = 0;

  this.playlist      = [];  // array of media items
  this.rawPlaylist   = "";  // raw xml string form
  this.currentTrack  = 0;
	this.playlistState = "Idle";
	this.shuffle_indexes = [];
	this.offset = 0;
  this.pausetime 	= '00:00:00';
  this.playMode   = 'standard';   // [static,streaming,standard]

  return this;
}
Util.inherits(AVTransportService, Service);
module.exports = AVTransportService;

//  Fisher-Yates shuffle algorithm.
AVTransportService.prototype.shuffle = function() {
  var array = self.shuffle_indexes
  , cur = array.length
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

AVTransportService.prototype.parseM3u 				= function(m3u){
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
      line0 = line;
			}
		if (!/(^#.*|^[\s\t]+#.*)/.test(line)){
			var filepath = url.parse(line);
			title = title ? title : path.basename(filepath.pathname);
			var ext   = path.extname(filepath.pathname);
			if (/^\.[\w]+/.test(ext)){
				ext = ext.slice(1);
				}
			else ext = 'mp3';

      meta = {

      }

      media = {
        raw:line0  + "\n" + line + "\n",
        meta:meta,
        item:{absStart:0},
        res:[{
          protocolInfo:'http-get:*:audio/'+ext+':*',
          uri:line,
          duration:'00:00:00'
         }]
      }

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

AVTransportService.prototype.parseAttrs = function(attrs, dest, filter){

  if (!filter) filter = function(){return true};
  for (var key in attrs){
		  var attr = attrs[key];
      if (filter(attr)){
        dest[attr.name] = attr.value;
      }
    }
}

AVTransportService.prototype.parseItem 	= function(item){

  var self = this
	,   media = {
      raw:item.toString({compressed:true}), // for playlistInfo
      meta:item.toString({compressed:true}),// for playNext
      item:{absStart:0},
      res:[]
    }
  ;

	// parse item container Ids
	// self.parseAttrs(item.attr, media.container);

	// parse <item>
	for (var child in item.children){
      // parse <res>
      if (child.name == "res"){
        // skip localhost uri as they dont make any sense for upnp control points
        if (!/127.0.0.1/.test(child.val)){

          var res = {uri:child.val, duration:'00:00:00'}
          self.parseAttrs(child.attr, res, function(attr){
            return /duration/.test(attr.name);
            });

          media.res.push(res);
        }
      } else {
        media.item[child.name] = child.val;
      }
		}
	return media;
	}

AVTransportService.prototype.toMedia		= function(xml){
	var self = this;
	var json = [];

  /*
	var list = self.childrensNamed(xml, "container", Xmlns.DIDL_LITE);
	if (undefined != list){
		for (var i in list){
			var media 	= self.parseItem(list[i]);
			json.push(media);
		}
	}
  */
	// parse items
	var list = self.childrensNamed(xml, 'item', Xmlns.DIDL_LITE);
	if (undefined != list){
		for (var i in list){
			var media 	= self.parseItem(list[i]);
			json.push(media);
		}
	}
	return json;
}
/*
 *  Processing staticPlaylist xml
 */
AVTransportService.prototype.processPlaylist	= function(callback){

    var self = this;
    var xml
    ,   res
    ,   mimetype = self.stateVars["A_ARG_TYPE_PlaylistMIMEType"].get()
    ;
    self.playlist = [];

    switch (mimetype){
      case "text/xml":{
        try{
          xml = new xmldoc.XmlDocument(self.rawPlaylist);
          self.playlist = self.toMedia(xml);
        } catch(ex){
          return callback(736,"The playlist delivered failed syntactic or semantic checks.");
        }
      } break;
      case "audio/m3u":{
        self.playlist = self.parseM3u(self.rawPlaylist);
      } break;
    }


    self.shuffle_indexes = self.playlist.map(function(item, index){
      return index;
    });

		var CurrentPlayMode = self.stateVars["CurrentPlayMode"].get();
		switch (CurrentPlayMode){
			case 'SHUFFLE_NOREPEAT':
			case 'SHUFFLE':{
        self.shuffle();
				} break;
		}

    // compute absolute times for playlist
    self.absStart();

    // static playlist dosent make use of currentTrack
    self.stateVars["NumberOfTracks"].set(self.playlist.length);

    self.playMode = 'static';

    self.stateVars["CurrentTrack"].set(0);
    self.currentTrack  = 0;
    self.playlistState = "Ready";
    callback(null);
}

AVTransportService.prototype.parseMeta				= function(raw, action, response, callback){

  var self = this;

  var xml = new xmldoc.XmlDocument(body);

  console.log(util.inspect(xml));

  // NOTE: recursively call this if any of the media found is a playlist itself.

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

AVTransportService.prototype.getCurrentTrack	= function(index){
	var self = this
	,	currentTrack	= index != undefined ? index : self.currentTrack
	;
	trackIndex 	 = self.shuffle_indexes[currentTrack];
	return trackIndex;
	}

AVTransportService.prototype.play = function(){

  var self = this;

  var uri  = this.stateVars["AVTransportURI"].get();
  var meta = this.stateVars["AVTransportURIMetaData"].get();

  var track= this.currentTrack;

  var duration = "00:00:00";
      /*
      <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
                 xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
                 xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
                 xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
          <item id="13607" parentID="13611" restricted="1">
            <dc:title>Lose yourself</dc:title>
            <upnp:class>object.item.audioItem.musicTrack</upnp:class>
            <upnp:artist>Eminem</upnp:artist>
            <dc:date>2012-07-19T22:12:54</dc:date>
            <res duration="00:00:00" size="4171517">
              http://192.168.1.183:8081/MediaServer/cds/content/13607
            </res>
          </item>
      </DIDL-Lite>
      */
  if (meta){
    var xml         = new xmldoc.XmlDocument(meta);
    var _duration   = self.childAttributeValue(xml, 'duration', Xmlns.DIDL_LITE);
    if (_duration){
  	   duration  = _duration;
    }
  }

  this.stateVars["TransportState"].set('TRANSITIONING');

  this.emit("play", uri, function(){

  //this.stateVars["CurrentTrack"].set(track);
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
  var self = this
  ,	next = (witch != null) ? witch : 1
  ,	len
  ,	numberOfTracks= self.playlist.length-1
  ,	playMode 		  = self.stateVars.CurrentPlayMode.get()
  ,	currentTrack	= self.currentTrack
  , nextTrack     = -1
  ,	trackIndex
  ,	media
  ,	args
  ;

  switch (playMode){
    case 'RANDOM':{
      trackIndex = Math.floor(Math.random()*numberOfTracks);
      } break;
    case 'DIRECT_1':  return;
    case 'REPEAT_ONE': break;
    case 'INTRO': len = 10000;
    case 'SHUFFLE_NOREPEAT':
    case 'NORMAL':{
      nextTrack = currentTrack + next;
      if (nextTrack > numberOfTracks)
        return;
      } break;
    case 'SHUFFLE':
    case 'REPEAT_ALL':{
      nextTrack = currentTrack + next;
      if (nextTrack > numberOfTracks)
        nextTrack = 0;
    } break;
  }

  if (nextTrack < 0)
     nextTrack = numberOfTracks;

  trackIndex = self.getCurrentTrack(nextTrack);

  media = self.playlist[trackIndex];
  self.stateVars.TransportState.set('STOPPED');
  self.stateVars.AbsoluteTimePosition.set(timeToString(media.item.absStart));
  self.stateVars.RelativeTimePosition.set('00:00:00');
  self.currentTrack = trackIndex;

  // when not playing staticPlaylist
  if (self.playMode != 'static'){
    self.stateVars["CurrentTrack"].set(trackIndex);
  }

  self.offset = 0;

  self.stateVars["AVTransportURI"].set(media.res[0].uri);
  self.stateVars["AVTransportURIMetaData"].set(media.meta);

  self.play();


}

AVTransportService.prototype.seek = function(target){
  // seek time
  this.play();

}

AVTransportService.prototype.processSoap_SetPlayMode = function(xml, request, callback) {
  var self = this;

  var CurrentPlayMode = this.soapVars["NewPlayMode"];

  this.stateVars["CurrentPlayMode"].set(CurrentPlayMode);
  this.soapVars["UpdateID"] = this.updateID ++;
  callback(null);

}

AVTransportService.prototype.processSoap_GetPlaylistInfo = function(xml, request, callback) {

  var self = this
  , raw = ""
  , playlistAllowedFormats = [{
    _name:"contentType",
    _attrs:{
      MIMEType:"text/xml",
      extendedType:"*"
      }
    },{
    _name:"contentType",
    _attrs:{
      MIMEType:"text/xml",
      extendedType:"DLNA.ORG_PN=DIDL_V"
      }
    },{
    _name:"contentType",
    _attrs:{
      MIMEType:"audio/m3u",
      extendedType:"*"
      }
    }]
	,	playlistCurrentFormat = []
  ;

  var PlaylistType = self.soapVars["PlaylistType"];

  var type;
  switch (PlaylistType){
    case "Static":
    case "StaticPlContents":
      type = "static";
    break;
    default:
      type = "streaming";
  }

  if (self.playlistState != 'Idle') {
      playlistCurrentFormat.push({
        _name:"contentType",
        _attrs:{
          MIMEType:self.stateVars["A_ARG_TYPE_PlaylistMIMEType"].get(),
          extendedType:self.stateVars["A_ARG_TYPE_PlaylistExtendedType"].get()
          }
        });
  }


  var Jxml = {
    _name:type + 'PlaylistInfo',
    _content:[
      {
        _name:"playlistState",
        _content:self.playlistState
      },
      {
        _name:"playlistChunkLengthMax",
        _content:10240
      },
      {
        _name:"playlistTotalLengthMax",
        _content:524288
      },
      {
        _name:"playlistCurrentFormat",
        _content:playlistCurrentFormat
      },
      {
        _name:"playlistAllowedFormats",
        _content:playlistAllowedFormats
      }
    ]
  };


  if (PlaylistType.indexOf("Content") > -1){

    if (state == 'Ready'){
      raw = self.shuffle_indexes.map(function(i){
  			return self.playlist[i].raw;
  			}).join('');
  	}

    var playlistContents ={
        _name:"playlistContents",
        _attrs:{},
        _content:raw
      };

    var NumberOfTracks = self.stateVars["NumberOfTracks"].get()
    ,   CurrentTrack   = self.currentTrack
    ,   trackIndex     = self.getCurrentTrack(CurrentTrack)
    ;

    switch(type){
      case "static":{
        playlistContents._attrs.currentObjID = self.playlist[trackIndex].item.id;
      }
      break;
      case "streaming":{
        playlistContents._attrs.currentTrack = CurrentTrack;
        Jxml._content.push({
            _name:"playlistTrackMin",
            _content:0
          },{
            _name:"playlistTrackMax",
            _content:NumberOfTracks
        });
      }
    }

    Jxml._content.push(playlistContents);
  }

  var xml = jstoxml.toXML(Jxml, {
    header : true,
    indent : " ",
    filter : xmlFilters
  });

	self.soapVars["playlistInfo"] = xml;

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
  ,   PlaylistStartObjID    = this.soapVars["PlaylistStartObjID"]
  ,   PlaylistStartGroupID  = this.soapVars["PlaylistStartGroupID"]
  ;

  /*
  http://upnp.org/specs/av/UPnP-av-AVTransport-v3-Service.pdf   page 76:
  The PlaylistStartObj and PlaylistStartGroup arguments provide a starting object @id and
  starting group ID for playlists which employ object linking properties. If these arguments are
  non-empty, then the device should process playlist elements in the order specified by the
  objectLink@nextObjID and objectLink@prevObjID elements for the indicated object linking
  GroupID. For playlists that do not employ object linking properties, these arguments should be
  set to "". See the ContentDirectory service specification [7] for further details on object linking
  metadata properties.
  */

  // reset
  if (PlaylistTotalLength == 0){

    self.playlistState = "Incomplete";

    self.stateVars["A_ARG_TYPE_PlaylistTotalLength"].set(0);
    self.rawPlaylist = '';
    return callback(null);
  }

  if (PlaylistOffset == 0){

    self.playlistState = "Incomplete";
    self.stateVars["A_ARG_TYPE_PlaylistTotalLength"].set(PlaylistTotalLength);
    self.stateVars["A_ARG_TYPE_PlaylistMIMEType"].set(PlaylistMIMEType);
    self.stateVars["A_ARG_TYPE_PlaylistExtendedType"].set(PlaylistExtendedType);

    self.rawPlaylist = '';
  }

  var initialTotal = self.stateVars["A_ARG_TYPE_PlaylistTotalLength"].get();

  if (PlaylistOffset + PlaylistDataLength > PlaylistTotalLength){
    callback(735, "Playlist data length exceeds total length")
    return;
  }

  if (PlaylistDataLength < 1){
    callback(735, "Illegal playlist data length");
    return;
  }

  if (PlaylistTotalLength < 1){
    callback(735, "Illegal playlist length");
    return;
  }

  if (initialTotal != PlaylistTotalLength){
    callback(735, "Playlist total length changed");
    return;
  }

  self.rawPlaylist += PlaylistData;

  // setStaticPlaylist complete
  if (PlaylistOffset + PlaylistDataLength === PlaylistTotalLength){

    self.processPlaylist(callback);
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
            self.soapVars["UpdateID"] = self.updateID ++;
            callback(null);
          });

        return  this.seek(target);

      } break;
      case 'TRACK_NR':{
        var current = this.currentTrack;
        var delta   = parseInt(target)-current;
        this.stateVars["TransportState"].set('TRANSITIONING');
        this.once('play', function(){
            self.stateVars["TransportState"].set('PLAYING');
            self.soapVars["UpdateID"] = self.updateID ++;
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

      switch (self.playlistState){
        case "Incomplete":
          return callback(735, "Playlist incomplete");
        break;
        case "Ready":
          self.playlistState = "Active";
      }

      this.once('playing', function(){
        self.soapVars["UpdateID"] = self.updateID ++;
        callback(null);
      });

      this.play();
}

AVTransportService.prototype.processSoap_Stop = function(xml, request, callback) {
      var self = this;
      switch (self.playlistState){
        case "Incomplete":
          return callback(735, "Playlist incomplete");
        break;
      }
      this.once('stopped', function(){
        self.soapVars["UpdateID"] = self.updateID ++;
        callback(null);
      });
      this.stop();
}

AVTransportService.prototype.processSoap_Pause = function(xml, request, callback) {
      var self = this;

      this.once('paused', function(){
        self.soapVars["UpdateID"] = self.updateID ++;
        callback(null);
      });
      this.pause();
}

AVTransportService.prototype.processSoap_Next = function(xml, request, callback) {
      var self = this;
      // This action does not cycle back to the first track.
      // TODO: StaticPlaylist dosen't make use of CurrentTrack

      var CurrentTrack  = this.currentTrack
      ,   NumberOfTracks= this.stateVars["NumberOfTracks"].get()
      ;
      if (CurrentTrack + 1 > NumberOfTracks ){
        return callback(711, "Next action does not cycle back to the first track");
      }

      switch (self.playlistState){
        case "Incomplete":
          return callback(735, "Playlist incomplete");
        break;
        case "Ready":
          self.playlistState = "Active";
      }

      this.once('playing', function(){
        self.soapVars["UpdateID"] = self.updateID ++;
        callback(null);
      });

      this.playNext(1);
}

AVTransportService.prototype.processSoap_Previous = function(xml, request, callback) {
      var self = this;

      //  This action does not cycle back to the last track
      var CurrentTrack = this.currentTrack;
      if (CurrentTrack < 1){
         return callback(711, "Previous action does not cycle back to the last track");
      }

      switch (self.playlistState){
        case "Incomplete":
          return callback(735, "Playlist incomplete");
        break;
        case "Ready":
          self.playlistState = "Active";
      }

      this.once('playing', function(){
        self.soapVars["UpdateID"] = self.updateID ++;
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
    this.soapVars["UpdateID"] = self.updateID ++;
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
    /*
    <DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
               xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
               xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
               xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
        <item id="13607" parentID="13611" restricted="1">
          <dc:title>Lose yourself</dc:title>
          <upnp:class>object.item.audioItem.musicTrack</upnp:class>
          <upnp:artist>Eminem</upnp:artist>
          <dc:date>2012-07-19T22:12:54</dc:date>
          <res duration="00:00:00" size="4171517">
            http://192.168.1.183:8081/MediaServer/cds/content/13607
          </res>
        </item>
    </DIDL-Lite>
    */
    console.log("Media :%s, Meta:%s", media, meta);

    // remove dlna from url (hdhomerun), escape $ (ps3 media server)
    media = media.replace(/\?dlna/g,'').replace(/\$/g,'%24');

    this.stateVars["AVTransportURI"].set(media);
    this.stateVars["AVTransportURIMetaData"].set(meta);
    this.stateVars["CurrentTrack"].set(1);
    this.soapVars["UpdateID"] = this.updateID ++;
    // playlistContainer -> empty CurrentURI
    var state   =  this.stateVars["TransportState"].get();
    if (state == 'PAUSED_PLAYBACK'){
      this.stateVars["TransportState"].set('STOPPED');
      }

    // playlist url or single item

    // AVT 1.x playlist
    // meta is a m3u file
    if (meta && (/m3u/.test(meta) || /text\/xml/.test(meta))){
      // process as staticPlaylist

      // AvTransport:1
      // download playlist content
      // NOTE : m3u is unaware of metadata
      var mimetype
      ,   extended = '*';

      if (/m3u/.test(meta)){
        mimetype = 'audio/m3u';
      } else {
        mimetype = 'text/xml';
      }

      // this.buildPlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      // retrieve playlist
      this.httpRetrieve(media, function(soapErrorCode, error, body){
        if (error){
            this.stateVars["TransportState"].set('STOPPED');
            return callback(soapErrorCode, error);
          }
          self.soapVars['PlaylistMIMEType']     = mimetype;
          self.soapVars['PlaylistExtendedType'] = extended;
          self.soapVars["PlaylistOffset"]       = 0;
          self.soapVars["PlaylistStartObjID"]   = "";
          self.soapVars["PlaylistStartGroupID"] = "";
          self.soapVars["PlaylistDataLength"]   = body.length;
          self.soapVars["PlaylistTotalLength"]  = body.length;
          self.soapVars["PlaylistData"]         = body;

          return self.processSoap_SetStaticPlaylist(xml, request, callback);
        // return self.parseM3u(body, callback);
      });
      return;
    }
    else {  // single media uri

      this.stateVars["NumberOfTracks"].set(1);

      self.playlistState = "Idle";
      self.playMode      = "standard";
      /*
      var mimetype = 'text/xml',
        extended = '*';

      this.stateVars['A_ARG_TYPE_PlaylistMIMEType'].set(mimetype);
      this.stateVars['A_ARG_TYPE_PlaylistExtendedType'].set(extended);

      // this.buildPlayListInfo('static', 'Incomplete', {mime:mimetype, extended:extended});

      return this.processPlaylist(meta, 0, callback);
      */
    }
    callback(null);
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
  var lastJXML   = LastChange.get();
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
    if (instance[i]._name == stateVar.name){
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

  debugEvent("LastChange ", Util.inspect(lastJXML, {depth:null}));

  LastChange.set(lastJXML);
}
