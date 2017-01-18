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
const ignore = require('ignore');

// promisify a few funcs we need
"dirExists,ensureDir,emptyDir,emptyDir,readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

function _load_ergoignoreFilter(dir) { // loads the file, if found OR returns an empty one
	const fname = '.ergoignore';
	return fs
		.readFile(path.join(dir, fname ), 'utf8')
		.catch(function(err) {
			l.vvlog(".ergoignore not found in '"+dir+"'");
			return ''; // ignore missing file, etc.
		})
		.then(function(data) {
			if (data.length>0)
				l.vlog("Loaded ignore file: '"+path.join(dir,fname)+"'");
			return ignore().add([fname]).add(data.toString()).createFilter();
		});
}


function _walk(dir, filterFn, fn) {
return Promise.coroutine(function *() {
	var p = Promise.resolve();
	var walkerP = new Promise(function(resolve) { // I'd love to know how to not use the promise anti-pattern here!

		function resolvall(result) {
			p.then(function() {
				l.vvlog("Directory traversal is complete. Result: " + result)
				resolve(true)
			});
		}

		fs.walk(dir, {filter:filterFn})
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

/*
function _getDirLastWriteTime(dir)
{
return Promise.coroutine(function *() {
	if (!(yield fs.dirExists(dir)))
		return new Date(1970,1,1);

	var dlatest = 0;
	yield _walk(dir, null, function(item) {
		if (item.stats.mtime>dlatest)
			dlatest = item.stats.mtime;
	}) 
	return dlatest;
})();
}
*/

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

	var rebuild = options.clean;
	/* This has now real effect. A file will only write if it actually changes anyhow.
	var _lastBuildTime = yield _getDirLastWriteTime(context.getOutPath());
	if (!rebuild && (yield _getDirLastWriteTime(context.getPartialsPath()))>_lastBuildTime) {
		l.log("Partials directory has changed. Rebuilding...")
		rebuild = true;
	}
	if (!rebuild && (yield _getDirLastWriteTime(context.getLayoutsPath()))>_lastBuildTime) {
		l.log("Layouts directory has changed. Rebuilding...")
		rebuild = true;
	}*/

	if (rebuild) {
		//yield fs.emptyDir(context.getOutPath()); Removed. We know obey .ergoignore

		var _destFilterFn = yield _load_ergoignoreFilter(context.getOutPath())
		var _destIgnoreFn = function(item) { 
			var relItem = path.relative(context.getOutPath(), item)
			return _destFilterFn(relItem);
		}
		var _deleteFile = function(item) {
			l.vlog("Removing '"+item.path+"'...");
			fs.remove(item.path);
		}
		l.log("Cleaning '"+context.getOutPath()+"'...")
		yield _walk(context.getOutPath(), _destIgnoreFn, _deleteFile);
	}

	var _loadFile = function(item) {
		return context.addFile(item.path, item.stats)
			.then(function() {
				return true;
			})
	}


	
	l.log("Reading '"+context.getSourcePath()+"'...")
	var _sourceFilterFn = yield _load_ergoignoreFilter(context.getSourcePath())
	var _sourceUseFn = function(item) {
		var relItem = path.relative(context.getSourcePath(), item)
		return _sourceFilterFn(relItem);
	}
	yield _walk(context.getSourcePath(), _sourceUseFn, _loadFile);

	// Now that all the files are loaded, we can do something about rendering them
	yield plugin_api.renderAll(context);

	l.log("Done");
	return true;
})();
}