# upnpserver

by Olivier Oeuillot

UpnpServer is a fast and light upnp server written in NodeJS.
This version does not need an external database (mysql, mongodb), it stores all informations in memory.


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
 