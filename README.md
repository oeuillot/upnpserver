# upnpserver

UpnpServer is a fast and light upnp server written in NodeJS.
This version does not need an external database (mysql, mongodb), it stores all informations in memory.


## Compatibility

- Freebox HD
- Soundbridge
- ht5streamer 
- Intel Device Validator

## Installation

    $ npm install upnpserver

## Help

```
 $ nodejs server.js --help

  Usage: server.js [options]

  Options:

    -h, --help              output usage information
    -V, --version           output the version number
    -d, --directory <path>  Mount directory
    -m, --music <path>      Mount music directory
    -n, --name <name>       Name of server
    -u, --uuid <uuid>       UUID of server
    --dlna                  Enable dlna support
    --lang <lang>           Specify language (en, fr)
    -p, --httpPort <port>   Http port

```

## Example

```  

 $ nodejs server.js -d /MyFilms=/data/MyFilms -d /PublicVideo=/home/me/videos -m /Musiques=/home/Musiques -n "My server" 

 ```
 
 
## API Usage

```javascript

    var Server = require("upnpserver");
    
    var server=new Server({ /* configuration, see below */ }, [
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
- `strict` _Boolean_ Use only official UPNP attributes. Default: false
- `lang` _String_ Specify the language (en, fr) for virtual folder names. Default: en
- `ssdpLog` _Boolean_ Enable log of ssdp layer. Default: false
- `ssdpLogLevel` _String_ Log level of ssdp layer.


## Author

Olivier Oeuillot
