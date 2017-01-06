/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the public api for 'view'
* Returns a Promise
*
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-view');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var watch_api = require('./watch')._watch;
var Promise = require('bluebird')
var http = require("http"),
	url = require("url"),
	path = require("path");
var posix = path.posix; // for ALWAYS slosh-y stuff (for. uri's)


var _server = null;
function _serveWeb(options, context) { // book, port, web_root) {

	options.web_root = context.getOutPath();
	options.uri_root = posix.join('/', options.uri_root || '', '/');
	options.port = options.port || 8181;

	if (_server && _server.listening)
	{
		l.logw("Re-initialising...")
		_server.options = options;
		return _server;
	}

	l.log('Serving web from: ' + options.web_root)

	_server = http.createServer(function(request, response) {
		var uri = url.parse(request.url).pathname;

		// strip out the uri root, making it ALWAYS relative to the root
		if (options.uri_root != '/') {
			var reluri = posix.relative(options.uri_root, uri);
			var newuri = posix.join('/', reluri);
			l.logd("uri '"+uri+"' => '"+reluri+"' => '"+newuri+"'");

			if (reluri.length==0 && newuri=='/' && uri.substr(-1)!='/') {
				// a request for '/blah', rather than '/blah/'
				l.logw("302. '"+uri+"' => '"+reluri+"' => '"+newuri+"' redirecting");
				response.writeHead(302, {"Location": "http://localhost:"+options.port+options.uri_root});
				response.end();
				return;
			}

			if (reluri.length>1 && reluri.substr(0,2)=='..' && uri.indexOf('favicon.ico')<0) { // bad food. reject it
				l.loge("403. '"+uri+"' => '"+reluri+"' => '"+newuri+"' becomes a path outside the document root");
				response.writeHead(403, {"Content-Type": "text/plain"});
				response.write("403 Forbidden\nWhen trying to open: '" + newuri + "'");
				response.end();
				return;
			}

			uri = newuri;
		}

		var filename = path.join(options.web_root, uri);

		fs.stat(filename, function(err, stats) {
			if(err) {
				l.loge("404. '"+filename+"'. Reason: " + err);
				response.writeHead(404, {"Content-Type": "text/plain"});
				response.write("404 Not Found\nWhen trying to open: '" + filename + "'");
				response.end();
				return;
			}

			if (stats.isDirectory()) 
				filename = path.join(filename,'index.html');

			fs.readFile(filename, "binary", function(err, file) {
				if(err) {        
					l.loge("Failed to open '"+filename+"'. Reason: " + err);
					response.writeHead(500, {"Content-Type": "text/plain"});
					response.write(err + "\n");
					response.end();
					return;
				}

				response.writeHead(200);
				response.write(file, "binary");
				response.end();
			});
		});
	});

	_server.options = options;
	l.logd("Ready to start")
	_server.listen(parseInt(options.port, 10));
	l.log("Web server started at\n  => http://localhost:" + options.port + options.uri_root + "\nPress Ctrl + C to shutdown...");

	return _server;
}




module.exports = function(options) {
	return Promise.try(function() {
		options = options || {};
		var context = require('./config').getContextSync(options.working_dir);
		context.mergeRuntimeOptions(options);

		if (_.isDefined(options['watch']))
		{
			watch_api(options, context);
			l.logd("Watcher ready")
		}
		return _serveWeb(options, context);
	});
}