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
var plugin = require('./plugin')
var context = require('../lib/context');
var FileInfo = require('../lib/fileinfo');

// promisify a few funcs we need
"dirExists,ensureDir,readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

/*
Options can be:

{
	step3: profit
}

*/



module.exports = function(options) {
return Promise.coroutine(function *() {
	options = options || {};
	var context = require('./config').getContextSync(options.working_dir);
	options = context.mergeRuntimeOptions(options);

	// load the default plugins, markdown, textile and simple
	var plugins_to_load = context.config.plugins || "{default}"
	l.logd("Plugins to load: " + plugins_to_load);
	_.toRealArray(plugins_to_load, ',').forEach(function(name) {
		if (name=="{default}" || name=="default")
		{
			plugin.loadPlugin("simpletag", context)
			plugin.loadPlugin("textile", context)
			plugin.loadPlugin("marked", context)
		}
		else
			plugin.loadPlugin(name, context)
	});

	l.vvlogd("Context is:\n"+l.dump(context));

	if (!(yield fs.dirExists(context.getSourcePath())))
		throw new Error("Missing source path: "+context.getSourcePath());

	// (We'll deal with missing layouts/partials as they arise, since they may not actually be needed)
	yield fs.ensureDir(context.getOutPath());

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
					else
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
	for (var i=0; i<context.files.length; i++)
	{
		var fi = context.files[i];
		fi.render(context); // this is not promisable
		yield fi.save(context); // some files, eg partials and layouts might actually refuse to do this! (This is expected)
	}

	// Now, give the plugins a chance to actually write out some extra stuff based on what they need
	yield plugin.saveAll(context);

	l.log("Done");
	return true;
})();
}