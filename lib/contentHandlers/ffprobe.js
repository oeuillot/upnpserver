/*jslint node: true, plusplus: true, nomen: true, vars: true */
"use strict";

var Path = require("path");
var fs = require("fs");
var Util = require('util');
var spawn = require('child_process').spawn;

var debug = require('debug')('upnpserver:ffprobe');

var Abstract_Metas = require('./abstract_metas');

var ffprobe = function(configuration) {
  Abstract_Metas.call(this, configuration);

  configuration = configuration || {};

  this.configuration = configuration;

  var ffprobe = configuration.ffprobe_path;
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
};

Util.inherits(ffprobe, Abstract_Metas);

module.exports = ffprobe;

ffprobe.prototype.prepareNode = function(node, callback) {
  if (!this.ffprobe_path) {
    return callback();
  }

  var contentURL = node.attributes.contentURL;
  if (!contentURL) {
    return callback();
  }

  var parameters = [ '-show_streams', '-show_format', '-print_format', 'json',
      '-loglevel', 'warning', contentURL ];
  if (debug.enabled) {
    debug("Launch", this.ffprobe_path, parameters);
  }

  var proc = spawn(this.ffprobe_path, parameters);
  var probeData = [];
  var errData = [];
  var exitCode = undefined;
  var start = Date.now();

  var self = this;

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');

  proc.stdout.on('data', function(data) {
    probeData.push(data);
  });
  proc.stderr.on('data', function(data) {
    errData.push(data);
  });

  proc.on('exit', function(code) {
    exitCode = code;
  });
  proc.on('error', function(error) {
    if (error) {
      console.error(error);
    }

    callback();
  });
  proc.on('close', function() {
    if (!probeData) {
      setImmediate(callback);
      return;
    }

    if (exitCode) {
      var err_output = errData.join('');

      console.error(new Error("FFProbe error: " + err_output));
      return callback();
    }

    var json = JSON.parse(probeData.join(''));
    json.probe_time = Date.now() - start;

    self._processProbe(node, json, callback);
  });
};

ffprobe.prototype._processProbe = function(node, json, callback) {
  if (debug.enabled) {
    debug("Probe return=", json);
  }

  var res = node.getRes();

  var video = false;
  var audio = false;

  var resExt = res.ext || {};

  var componentInfos = resExt.componentInfos;
  if (componentInfos) {
    return callback();
  }

  var components = [];

  componentInfos = [ {
    groupId : 0,
    components : components
  } ];

  var streams = json.streams;
  if (streams.length) {
    streams.forEach(function(stream) {

      if (stream.codec_type === "video") {

        var component = {
          componentID : "video_" + components.length,
          componentClass : "Video"
        };
        components.push(component);

        switch (stream.codec_name) {
        case "h261":
          component.mimeType = "video/h261";
          break;
        case "h263":
          component.mimeType = "video/h263";
          break;
        case "h264":
          component.mimeType = "video/h264";
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

          if (stream.width && stream.height && !res.resolution) {
            res.resolution = stream.width + "x" + stream.height;
          }

          if (stream.duration && !res.duration) {
            res.duration = parseFloat(stream.duration);
          }
          if (stream.codec_name && !res.vcodec) {
            res.vcodec = stream.codec_name;
          }
        }
        return;
      }
      if (stream.codec_type === "audio") {
        var component = {
          componentID : "audio_" + components.length,
          componentClass : "Audio"
        };

        switch (stream.codec_name) {
        case "dca":
          component.mimeType = "audio/dca"; // DTS
          break;
        case "aac":
          component.mimeType = "audio/ac3"; // Dolby
          break;
        case "aac":
          component.mimeType = "audio/x-aac";
          break;
        case "webm":
          component.mimeType = "audio/webm";
          break;
        case "wav":
          component.mimeType = "audio/x-wav";
          break;
        }
        if (stream.channels) {
          component.nrAudioChannels = stream.channels;
        }
        var tags = stream.tags;
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

          if (stream.duration && !res.duration) {
            res.duration = parseFloat(stream.duration);
          }
          if (stream.codec_name && !res.acodec) {
            res.acodec = stream.codec_name;
          }
          if (stream.bit_rate && !res.bitrate) {
            res.bitrate = stream.bit_rate;
          }
          if (stream.channels && !res.nrAudioChannels) {
            res.nrAudioChannels = stream.channels;
          }
          if (stream.sample_rate && !res.sampleFrequency) {
            res.sampleFrequency = stream.sample_rate;
          }
          if (stream.bit_rate && !res.bitrate) {
            res.bitrate = stream.bit_rate;
          }
        }
        return;
      }
      if (stream.codec_type === "subtitle") {
        var component = {
          componentID : "sub_" + components.length,
          componentClass : "Subtitle"
        };

        var tags = stream.tags;
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
      resExt.componentInfos = componentInfos;

      res.ext = resExt;
    }
  }

  if (debug.enabled) {
    debug("FFProbe res=", res);
  }

  setImmediate(callback);
};

function convertLanguage(lang) {
  return lang;
}
