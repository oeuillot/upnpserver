/**
 * Implements Player : a generic player to extend with real one
 *
 * param {AVTransportService}   avt : instance
 * param {RenderingControl}     rcs : instance
 * param {ConnectionManager}    cm  : instance
 */
var Player = module.exports = function(avt, cm, rcs){
  var self = this;
  this.avt = avt;
  this.rcs = rcs;
  this.cm  = cm;

  this.volume = 50;
  avt.on("play",   self.play.bind(self));
  avt.on("stop",   self.stop.bind(self));
  avt.on("pause",  self.pause.bind(self));
//rcs.on("volume", self.setVolume.bind(self));
  return this;
}
Player.prototype.setVolume  = function(volume, callback){
  this.volume = volume;
  callback();
}
Player.prototype.play       = function(uri, callback){
  console.log("Player.play uri:%s", uri);
  // Play the media, callback when playing
  callback();
}
Player.prototype.pause      = function(callback){
  console.log("Player.pause");
  callback();
}
Player.prototype.stop       = function(callback){
  console.log("Player.stop");
  callback();
}
