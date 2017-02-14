/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'build'
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-lib-walk');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
const ignore = require('ignore');

// promisify a few funcs we need
"dirExists,ensureDir,emptyDir,emptyDir,readFile,writeFile,readlink,realpath".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

function __load_ergoignoreFilter(dir, ignorelist) { // loads the file, if found OR returns an empty one
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
			var r = ignore().add([fname, '.git', 'node_modules']);
			if (ignorelist)
				r = r.add(_.toRealArray(ignorelist));
			return r.add(data.toString()).createFilter();
		});
}

function _walk(dir, fn, options) {
return Promise.coroutine(function *() {
	options = options||{};
	var ignoreFilter = yield __load_ergoignoreFilter(dir, options.ignore);
	var filterFn = function(item) { 
				var relItem = path.relative(dir, item)
				return ignoreFilter(relItem);
			}
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
			if (stats.isFile() || (!!options.walkDirs && stats.isDirectory() && item.path!=dir)) {
				p = p.then(function() { 
					return fn(item); 
				})
			}
			else if (options.followSymLinks && stats.isSymbolicLink()) {
				//l.vlog("symlink: " + stats.isDirectory() + "\n"+l.dump(item))
				p = p.then(function(){
					return fs.realpath(item.path).
						then(function(resolved_path) {
							//resolved_path = path.resolve(dir, resolved_path)
							l.vlog("Followed symlink path: "+resolved_path)
							return _walk(resolved_path, fn); // NB: don't follow symlinks again!
						})
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

module.exports = _walk;
