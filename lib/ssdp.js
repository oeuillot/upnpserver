
/**
 * Extend SSDP server to handle multiple devices
 */
var Server =  require('node-ssdp').Server;
var util   = require('util');
var dgram  = require('dgram');
var ip = require('ip');

var SsdpServer = module.exports = function SsdpServer(opts, sock){
  var self = this;

  // reuse address to prevent EBOUND error
  var sock = dgram.createSocket({type:'udp4',reuseAddr:true});

  Server.call(this, opts, sock);
  this.bootId      = Date.now();
  this.configId    = opts.configId || 1;
  this.upnpVersion = opts.upnpVersion || 0;
  this._devices    = {};
  this.ips         = opts.ips;

  // use servers bound to each interface to advertise
  this.clients = {};

  this.ips.forEach(function(host){

    // create one socket for each ip
    var client = self._createSocket();

  	client.on('error', function onSocketError(err) {
      self._logger.error(err, 'Socker error for:' + host)
    });

    client.on('message', function onSocketMessage(msg, rinfo) {
      // we are not realy listening here, only advertising
      // self._parseMessage(msg, rinfo)
    });

    client.on('listening', function onSocketListening() {

      var addr = self.sock.address()

      self._logger.info('SSDP listening on ' + 'http://' + addr.address + ':' + addr.port)

      client.addMembership(self._ssdpIp)
    });

    self.clients[host] = client;
  })
}

util.inherits(SsdpServer, Server);

SsdpServer.prototype._stop = function () {

  Server.prototype._stop.call(this);

  for (var host in this.clients){
    this.clients[host].close();
    delete this.clients[host];
  }

}


// [1] http://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.1.pdf

SsdpServer.prototype.addRoot  = function( uuid, usn, location ){
  var root = {
    location: location,
    usn:{}
  };
  // [1] page 20 table 1-1
  root.usn['upnp:rootdevice'] = uuid + '::upnp:rootdevice';
  root.usn[uuid] = uuid;
  root.usn[usn]  = uuid + '::' + usn;
  this._devices[uuid] = root;
}

SsdpServer.prototype.addDevice = function( uuid, usn, location){
    var device = {
      location: location,
      usn:{}
    };
    // [1] page 20 table 1-2
    device.usn[uuid] = uuid;
    device.usn[usn]  = uuid + '::' + usn;
    this._devices[uuid] = device;
}

SsdpServer.prototype.addService = function( uuid, st){
    // [1] page 20 table 1-3
    this._devices[uuid].usn[st] = uuid + '::' + st;
}
/**
 *  Upnp device architecture v1.1 headers
 */
SsdpServer.prototype.addV1Headers = function(heads, alive){

  var self = this;
  if (self.upnpVersion > 0){

    // required
    heads['BOOTID.UPNP.ORG']     = self.bootId;

    // parallel to description configId attribute
    // required but optionnal for m-search response
    heads['CONFIGID.UPNP.ORG']   = self.configId;

    if (self.ipFamily === 'Ipv6'){
      heads['OPT']    = '"http://schemas.upnp.org/upnp/1/0/"; ns=01';
      heads['01-NLS'] =  self.bootId;
    }

    if (alive){
      // optionnal
      heads['SEARCHPORT.UPNP.ORG'] = self._ssdpPort;
    }
  }
}

/**
 *
 * @param alive
 */
SsdpServer.prototype.advertise = function (alive) {
  var self = this

  if (alive === undefined) alive = true

  Object.keys(self._devices).forEach(function (uuid) {
      var device   = self._devices[uuid];

      Object.keys(device.usn).forEach(function(usn){
        var udn = device.usn[usn];

        // [1] page 22
        var heads = {
          'HOST': self._ssdpServerHost,
          'NT': usn, // notification type, in this case same as ST
          'NTS': (alive ? 'ssdp:alive' : 'ssdp:byebye'), // notification sub-type
          'USN': udn
        }

        self.addV1Headers(heads, alive);

        self.ips.forEach(function(host){

          if (alive) {
            heads['LOCATION'] = "http://" + host + device.location
            heads['CACHE-CONTROL'] = 'max-age=1800'
            heads['SERVER'] = self._ssdpSig // why not include this?
          }

          self._logger.trace('Sending an advertisement event')

          var message = new Buffer(self._getSSDPHeader('NOTIFY', heads))
          self.clients[host].send(message, 0, message.length, self._ssdpPort, self._ssdpIp, function (err, bytes) {
            self._logger.trace({'message': message.toString()}, 'Outgoing server message')
          });

        });
      });
    });
}

SsdpServer.prototype.findHostBySubnet = function(peer){

  var mask = ['255.255.255.0','255.255.0.0','255.0.0.0'];

  var len = this.ips.length;

  for (var i=0; i < 3; i++){

    var submask    = mask[i];
    var maskedPeer = ip.mask(peer, submask)

    for (var j=0; j<len; j++){

        var maskedIp = ip.mask(this.ips[j], submask);

        if (maskedIp == maskedPeer){
          return this.ips[j];
        }
    }

  }
  return ips[0];
}

// ssdpServer seem not listening for search when bound to an ip
SsdpServer.prototype._respondToSearch = function (serviceType, rinfo) {
  var self = this
    , peer = rinfo.address
    , port = rinfo.port


  if (!this.sock) return

  // unwrap quoted string
  if (serviceType[0] == '"' && serviceType[serviceType.length-1] == '"') {
    serviceType = serviceType.slice(1, -1)
  }

  // TODO:
  // find an ip laying on same subnet as the rinfo
  var host = self.findHostBySubnet(peer);

  Object.keys(self._devices).forEach(function (uuid) {
      var device   = self._devices[uuid];

      Object.keys(device.usn).forEach(function(usn){

        var udn = device.usn[usn];

        if (serviceType === 'ssdp:all' || usn === serviceType) {
          var heads =   {
              'ST': usn,
              'USN': udn,
              'LOCATION': "http://" + host + device.location,
              'CACHE-CONTROL': 'max-age=' + self._ttl,
              'DATE': new Date().toUTCString(),
              'SERVER': self._ssdpSig,
              'EXT': ''
            };

          self.addV1Headers(heads, true);

          var pkt = self._getSSDPHeader(
            '200 OK',
            heads,
            true
          )

          self._logger.trace({'peer': peer, 'port': port}, 'Sending a 200 OK for an M-SEARCH')

          var message = new Buffer(pkt)

          self._send(message, peer, port, function (err, bytes) {
            self._logger.trace({'message': pkt}, 'Sent M-SEARCH response')
          })
        }
      })
  })
}
