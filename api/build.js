/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'build'
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-build');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var plugin_api = require('./plugin')
var context = require('../lib/context');
var FileInfo = require('../lib/fileinfo');

// promisify a few funcs we need
"dirExists,ensureDir,emptyDir,emptyDir,readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});



module.exports = function(options) {
return Promise.coroutine(function *() {
	l.log("Building...")
	options = options || {};
	var context = require('./config').getContextSync(options.working_dir);
	context.mergeRuntimeOptions(options);

	// load the default plugins, markdown, textile and simple
	var plugins_to_load = context.config.plugins || "{default}"
	_.toRealArray(plugins_to_load, ',').forEach(function(name) {
		plugin_api.loadPlugin(name, context)
	});

	l.vvlogd("Context is:\n"+l.dump(context));

	if (!(yield fs.dirExists(context.getSourcePath())))
		throw new Error("Missing source path: "+context.getSourcePath());

	// (We'll deal with missing layouts/partials as they arise, since they may not actually be needed)
	yield fs.ensureDir(context.getOutPath());

	if (options.clean)
		yield fs.emptyDir(context.getOutPath());

	var _loadFile = function(item) {
		return context.addFile(item.path, item.stats)
			.then(function() {
				return true;
			})
	}


	var _walk = function(dir, fn) {
		return Promise.coroutine(function *() {
			var p = Promise.resolve();
			var walkerP = new Promise(function(resolve) { // I'd love to know how to not use the promise anti-pattern here!

				function resolvall(result) {
					p.then(function() {
						l.vvlog("Directory traversal is complete. Result: " + result)
						resolve(true)
					});
				}

				fs.walk(dir)
				.on('data', function (item) {
					var stats = item.stats; // don't follow symlinks!
					if (stats.isFile()) {
						p = p.then(function() { 
							return fn(item); 
						})
					}
					else if (!stats.isDirectory())
						l.vlogd("skipping " + item.path)
				})
				.on('end', function () {
					// logging doesn't work here :( ????
					// l.vlog('********** Finished walking **************')
					resolvall("OK");
				})
				.on('error', function(e) {
					//l.vlogw("Failed to walk properly: \n" + _.niceStackTrace(e))
					resolvall("Failed to walk properly: \n" + _.niceStackTrace(e));
				})
				return true;
			});
			yield walkerP;
			yield p;
		})();
	};
	
	l.log("Reading '"+context.getSourcePath()+"'...")
	yield _walk(context.getSourcePath(), _loadFile);

	// Now that all the files are loaded, we can do something about rendering them
	yield plugin_api.renderAll(context);

	l.log("Done");
	return true;
})();
}