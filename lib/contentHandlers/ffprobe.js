/*jslint node: true, esversion: 6 */
"use strict";

const spawn = require('child_process').spawn;

const debug = require('debug')('upnpserver:contentHandlers:FFprobe');
const debugData = require('debug')('upnpserver:contentHandlers:FFprobe:data');
const logger = require('../logger');

const Abstract_Metas = require('./abstract_metas');

class ffprobe extends Abstract_Metas {
  constructor(configuration) {
    super(configuration);

    var ffprobe = this._configuration.ffprobe_path;
    if (!ffprobe) {
      ffprobe = process.env.FFPROBE_PATH;

      if (!ffprobe) {
        // ffprobe = "ffprobe";
      }
    }

    this.ffprobe_path = ffprobe;

    if (debug.enabled) {
      debug("ffprobe: BASE path=" + this.basePath);
    }
  }

  get name() {
    return "ffprobe";
  }

  /**
   * 
   */
  prepareMetas(contentInfos, context, callback) {
    if (!this.ffprobe_path) {
      return callback();
    }

    var contentURL = contentInfos.contentURL;
    var contentProvider = contentInfos.contentProvider;

    var localPath='-';
    
    if (contentProvider.isLocalFilesystem) {
      localPath=contentURL;
    }
    
    // TODO use ContentProvider
    var parameters = [ '-show_streams', '-show_format', '-print_format', 'json',
                       '-loglevel', 'warning', localPath ];

    debug("prepareMetas", "Launch ffprobe", this.ffprobe_path, "parameters=",parameters, "localPath=",localPath);

    var proc = spawn(this.ffprobe_path, parameters);
    var probeData = [];
    var errData = [];
    var exitCode;
    var start = Date.now();
    
    var callbackCalled=false;

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (data) => {
      debugData("prepareMetas", "receive stdout=", data);
      probeData.push(data);
    });
    proc.stderr.on('data', (data) => {
      debugData("prepareMetas", "receive stderr=", data);
      errData.push(data);
    });

    proc.on('exit', (code) => {
      debug("prepareMetas", "Exit event received code=", code);
      exitCode = code;
    });
    proc.on('error', (error) => {
      debug("prepareMetas", "Error event received error=", error, "callbackCalled=",callbackCalled);

      if (error) {
        logger.error("parseURL",contentURL, error);
      }

      if (callbackCalled) {
        return;
      }
      callbackCalled=true;
      callback();
    });

    proc.on('close', () => {
      debug("prepareMetas", "Close event received exitCode=",exitCode,"callbackCalled=",callbackCalled);
      debugData("prepareMetas", "probeData=", probeData);
      debugData("prepareMetas", "errData=", errData);
      
      if (callbackCalled) {
        return;
      }
      callbackCalled=true;

      if (!probeData) {
        setImmediate(callback);
        return;
      }

      if (exitCode) {
        var err_output = errData.join('');

        var error=new Error("FFProbe error: " + err_output);
        logger.error(error);
        return callback(error);
      }

      var json = JSON.parse(probeData.join(''));
      json.probe_time = Date.now() - start;

      try {
        this._processProbe(json, callback);
        
      } catch (x) {
        logger.error(x);
      }
    });
    
    if (localPath==='-') {
      debug("prepareMetas", "Read stream",contentURL,"...");
      contentProvider.createReadStream(null, contentURL, null, (error, stream) => {

        if (error) {
          logger.error("Can not get stream of '"+contentURL+"'", error);
          return callback(error);
        }
        
        debug("prepareMetas", "Pipe stream",contentURL," to ffprobe");

        stream.pipe(proc.stdin);
      });
    }
  }

  /**
   * 
   */
  _processProbe(json, callback) {
    debug("_processProbe", "Process json=", json);

    var video = false;
    var audio = false;

    var res={};

    var components = [];

    var componentInfos = [ {
      groupId : 0,
      components : components
    } ];

    var streams = json.streams;
    if (streams.length) {
      streams.forEach((stream) => {

        if (stream.codec_type === "video") {

          var component = {
              componentID : "video_" + components.length,
              componentClass : "Video"
          };
          components.push(component);

          switch (stream.codec_name) {
          case "mpeg1video":
            component.mimeType = "video/mpeg"; 
            break;
          case "mpeg4":
            component.mimeType = "video/mpeg4"; // MPEG-4 part 4
            break;
          case "h261":
            component.mimeType = "video/h261";
            break;
          case "h263":
            component.mimeType = "video/h263";
            break;
          case "h264":
            component.mimeType = "video/h264";
            break;
          case "hevc":
            component.mimeType = "video/hevc";
            break;
          case "vorbis":
            component.mimeType = "video/ogg";
            break;
          }
          var tags = stream.tags;
          if (tags) {
            if (tags.title) {
              component.title = tags.title;
            }
          }

          if (!video) {
            video = true;

            if (stream.width && stream.height) {
              res.resolution = stream.width + "x" + stream.height;
            }

            if (stream.duration) {
              res.duration = parseFloat(stream.duration);
            }
            if (stream.codec_name) {
              res.vcodec = stream.codec_name;
            }
          }
          return;
        }
        if (stream.codec_type === "audio") {
          let component = {
              componentID : "audio_" + components.length,
              componentClass : "Audio"
          };

          switch (stream.codec_name) {
          case "mp2":
            component.mimeType = "audio/mpeg";
            break;
          case "mp4":
            component.mimeType = "audio/mpeg4";
            break;
          case "dca":
            component.mimeType = "audio/dca"; // DTS
            break;
          case "aac":
            component.mimeType = "audio/ac3"; // Dolby
            break;
          case "aac":
            component.mimeType = "audio/aac";
            break;
          case "webm":
            component.mimeType = "audio/webm";
            break;
          case "wav":
            component.mimeType = "audio/wave";
            break;
          case "flac":
            component.mimeType = "audio/flac";
            break;
          case "vorbis":
            component.mimeType = "audio/ogg";
            break;
          }
          if (stream.channels) {
            component.nrAudioChannels = stream.channels;
          }

          let tags = stream.tags;
          if (tags) {
            if (tags.language) {
              component.language = convertLanguage(tags.language);
            }
            if (tags.title) {
              component.title = tags.title;
            }
          }

          if (!audio) {
            audio = true;

            if (stream.duration) {
              res.duration = parseFloat(stream.duration);
            }
            if (stream.codec_name) {
              res.acodec = stream.codec_name;
            }
            if (stream.bit_rate) {
              res.bitrate = stream.bit_rate;
            }
            if (stream.channels) {
              res.nrAudioChannels = stream.channels;
            }
            if (stream.sample_rate) {
              res.sampleFrequency = stream.sample_rate;
            }
            if (stream.bit_rate) {
              res.bitrate = stream.bit_rate;
            }
          }
          return;
        }
        if (stream.codec_type === "subtitle") {
          let component = {
              componentID : "sub_" + components.length,
              componentClass : "Subtitle"
          };

          let tags = stream.tags;
          if (tags) {
            if (tags.language) {
              component.language = convertLanguage(tags.language);
            }
            if (tags.title) {
              component.title = tags.title;
            }
          }
        }
      });

      // One property ?
      if (components.length) {
        res.componentInfos=componentInfos;
      }
    }

    debug("_processProbe", "FFProbe res=", res);

    var metas={
        res: [res]
    };

    callback(null, metas);
  }
}

function convertLanguage(lang) {
  return lang;
}

module.exports = ffprobe;
