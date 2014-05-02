var util = require('util');
var commander = require("commander");

var Server = require("./api");

var directories = [];
var musicDirectories = [];

commander.option("-d, --directory <path>", "Mount directory", function(path) {
  var mountPoint = "/";
  var idx = path.indexOf("=");
  if (idx > 0) {
    mountPoint = path.substring(0, idx);
    path = path.substring(idx + 1);
  }

  directories.push({
    path : path,
    mountPoint : mountPoint
  });
});
commander.option("-m, --music <path>", "Mount music directory", function(path) {
  var mountPoint = "/";
  var idx = path.indexOf("=");
  if (idx > 0) {
    mountPoint = path.substring(0, idx);
    path = path.substring(idx + 1);
  }

  musicDirectories.push({
    path : path,
    mountPoint : mountPoint
  });
});

commander.option("-n, --name <name>", "Name of server");
commander.option("-u, --uuid <uuid>", "UUID of server");
commander.option("--dlna", "Enable dlna support");
commander.option("--lang <lang>", "Specify language (en, fr)");
commander.option("--strict", "Use strict specification");

commander.option("--profiler", "Enable memory profiler dump");

commander.option("-p, --httpPort <port>", "Http port", function(v) {
  return parseInt(v, 10);
});

try {
  commander.parse(process.argv);
} catch (x) {
  console.error("Exception while parsing", x);
}

// Create an UpnpServer with options

var server = new Server(commander);

// Add directories
directories.forEach(function(d) {
  server.addDirectory(d.mountPoint, d.path);
});

// Add music directories
musicDirectories.forEach(function(md) {
  server.addMusicDirectory(md.mountPoint, md.path);
});

server.start();

var stopped = false;

process.on('SIGINT', function() {
  console.log('disconnecting...');
  stopped = true;

  server.stop();

  setTimeout(function() {
    process.exit();
  }, 1000);
});

process.on('uncaughtException', function(err) {
  if (stopped) {
    process.exit(0);
    return;
  }
  console.error('Caught exception: ' + err);
});

server.on("waiting",
    function() {
      console.log("Waiting connexions on port "
          + server.httpServer.address().port);
    });


// Try to profile upnpserver manually !

setInterval(function() {
  console.log(util.inspect(process.memoryUsage()));
}, 1000 * 30);

if (commander.profiler) {
  var heapdump = require("heapdump");

  setInterval(function() {
    var memMB = process.memoryUsage().rss / 1048576;
    if (memMB > nextMBThreshold) {
      heapdump.writeSnapshot();
      nextMBThreshold += 100
    }
  }, 1000 * 60 * 10);
}