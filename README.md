# upnpserver
![upnpserver icon](icon/icon_128.png)

UpnpServer is a fast and light UPnP server written in NodeJS.
This version does not need an external database (mysql, mongodb), it stores all information in memory.


## Compatibility

- Freebox HD
- Soundbridge
- ht5streamer 
- Intel Device Validator
- Samsung AllShare play
- LG Smart Share
- Android
    - VPlayer (with UPNP Plugin)
    - NX Player

## Installation

    $ npm install upnpserver

## Command line

For command line, install [upnpserver-cli](https://github.com/oeuillot/upnpserver-cli) package. 
 
## API Usage

```javascript
var Server = require("upnpserver");

var server = new Server({ /* configuration, see below */ }, [
  '/home/disk1',
  { path: '/home/myDisk' },
  { path: '/media/movies', mountPoint: '/My movies'},
  { path: '/media/albums', mountPoint: '/Personnal/My albums', type: 'music' }
]);

server.start();
```

##Configuration
Server constructor accepts an optional configuration object. At the moment, the following is supported:

- `log` _Boolean_ Enable/disable logging. Default: false.
- `logLevel` _String_ Specifies log level to print. Possible values: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`. Defaults to `ERROR`.
- `name` _String_ Name of server. Default 'Node Server'
- `uuid` _String_ UUID of server. (If not specified, a UUID v4 will be generated)
- `hostname` _String_ Hostname to bind the server. Default: 0.0.0.0
- `httpPort` _Number_ Http port. Default: 10293
- `dlnaSupport` _Boolean_ Enable/disable dlna support. Default: true
- `strict` _Boolean_ Use only official UPnP attributes. Default: false
- `lang` _String_ Specify the language (en, fr) for virtual folder names. Default: en
- `ssdpLog` _Boolean_ Enable log of ssdp layer. Default: false
- `ssdpLogLevel` _String_ Log level of ssdp layer.

## Testing
For testing purposes used *mocha* framework. To run tests, you should do this:
```bash
make test
```

## Author

Olivier Oeuillot

## Contributors

https://github.com/oeuillot/upnpserver/graphs/contributors
