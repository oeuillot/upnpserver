
/**
 * Extend SSDP server to handle multiple devices
 */
var Server =  require('node-ssdp').Server;
var util   = require('util');

var SsdpServer = module.exports = function SsdpServer(opts, sock){
  Server.call(this, opts, sock);
}
util.inherits(SsdpServer, Server);

SsdpServer.prototype._devices = {};

SsdpServer.prototype.addDevice = function( udn, usn, location){
    var device = {
      location: location,
      usn:{}
    };
    device.usn[udn] = udn;
    device.usn['upnp:rootdevice'] = udn + '::upnp:rootdevice';
    device.usn[usn] = udn + '::' + usn;
    this._devices[udn] = device;
}

SsdpServer.prototype.addService = function( udn, st){
    this._devices[udn].usn[st] = udn + '::' + st;
}

/**
 *
 * @param alive
 */
SsdpServer.prototype.advertise = function (alive) {
  var self = this

  if (!this.sock) return
  if (alive === undefined) alive = true
  Object.keys(self._devices).forEach(function (udn) {
      var device   = self._devices[udn];

      Object.keys(device.usn).forEach(function(usn){
        var udn = device.usn[usn];

        var heads = {
          'HOST': self._ssdpServerHost,
          'NT': usn, // notification type, in this case same as ST
          'NTS': (alive ? 'ssdp:alive' : 'ssdp:byebye'), // notification sub-type
          'USN': udn
        }

        if (alive) {
          heads['LOCATION'] = device.location
          heads['CACHE-CONTROL'] = 'max-age=1800'
          heads['SERVER'] = self._ssdpSig // why not include this?
        }

        self._logger.trace('Sending an advertisement event')

        var message = new Buffer(self._getSSDPHeader('NOTIFY', heads))

        self._send(message, function (err, bytes) {
          self._logger.trace({'message': message.toString()}, 'Outgoing server message')
        })
      })
    })

}

SsdpServer.prototype._respondToSearch = function (serviceType, rinfo) {
  var self = this
    , peer = rinfo.address
    , port = rinfo.port

  // unwrap quoted string
  if (serviceType[0] == '"' && serviceType[serviceType.length-1] == '"') {
    serviceType = serviceType.slice(1, -1)
  }

  Object.keys(self._devices).forEach(function (udn) {
      var device   = self._devices[udn];

      Object.keys(device.usn).forEach(function(usn){

        var udn = device.usn[usn];

        if (serviceType === 'ssdp:all' || usn === serviceType) {
          var pkt = self._getSSDPHeader(
            '200 OK',
            {
              'ST': usn,
              'USN': udn,
              'LOCATION': device.location,
              'CACHE-CONTROL': 'max-age=' + self._ttl,
              'DATE': new Date().toUTCString(),
              'SERVER': self._ssdpSig,
              'EXT': ''
            },
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
