var http = require('http');
var SSDP = require('node-ssdp');
var url = require('url');
var UPNPServer = require("./lib/upnpServer");
var PathRepository = require("./lib/pathRepository");
var commander = require("commander");

commander.repositories = [];

commander.version(require("./package.json").version).option(
		"-d, --directory <path>", "Mount directory on root", function(path) {
			var mountPoint = "/";
			var idx = path.indexOf("=");
			if (idx > 0) {
				mountPoint = path.substring(0, idx);
				path = path.substring(idx + 1);
			}

			commander.repositories.push(new PathRepository(mountPoint, path));
		});

commander.option("-n, --name <name>", "Name of server");
commander.option("-u, --uuid <uuid>", "UUID of server");

commander.option("-p, --httpPort <port>", "Http port", function(v) {
	return parseInt(v, 10);
});

commander.parse(process.argv);

commander.name = commander.name || "Node Server";
commander.uuid = commander.uuid || "142f98b7-c28b-4b6f-8ca2-b55d9f0657e3";

commander.httpPort = commander.httpPort || 10293;

var upnpServer = new UPNPServer(commander.httpPort, commander, function(error,
		upnpServer) {
	if (error) {
		console.log("Can not start UPNP server : ", error);
		return;
	}

	var descURL = upnpServer.descriptionPath;
	if (descURL.charAt(0) == "/") {
		descURL = descURL.substring(1);
	}

	var server = new SSDP({
		logLevel : 'INFO',
		log : false,
		udn : upnpServer.uuid,
		description : descURL
	});

	server.addUSN('upnp:rootdevice');
	server.addUSN(upnpServer.type);

	upnpServer.services.forEach(function(service) {
		server.addUSN(service.type);
	});

	server.on('advertise-alive', function(heads) {
		// console.log('advertise-alive', heads);
		// Expire old devices from your cache.
		// Register advertising device somewhere (as designated in http headers
		// heads)
	});

	server.on('advertise-bye', function(heads) {
		// console.log('advertise-bye', heads);
		// Remove specified device from cache.
	});

	var httpServer = http.createServer(function(request, response) {
		var path = url.parse(request.url).pathname;

		// console.log("Uri=" + request.url);

		if (upnpServer.processRequest(request, response, path)) {
			return;
		}

		response.end('URL not implemented: ' + path);
	});

	httpServer.listen(upnpServer.port);

	server.server('0.0.0.0', upnpServer.port);

	process.on('SIGINT', function() {
		console.log('disconnecting...');

		server.stop();
		httpServer.close();

		setTimeout(function() {
			process.exit();
		}, 1000);
	});
});
