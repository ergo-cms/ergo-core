/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the public api for 'init'
* Returns a Promise
*/
"use strict";


var l  = require('ergo-utils').log.module('ergo-api-init');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var download = require("download-git-repo")

// promisify a few funcs we need
"fileExists".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});
download = Promise.promisify(download);

module.exports = function(dir, skeleton_repo, options) {
	if (!_.isDefined(dir))
		throw ('Command \'init\' is missing parameter \'dir\'');
	if (!_.isDefined(skeleton_repo))
		throw ('Command \'init\' is missing parameter \'skeleton_repo\'');
	options = options || {};

	//l.log('Initialising \'' + dir + '\' ...')
	return Promise.coroutine(function *() {
		if (!options.force) {
			// unless *forced* to, check that we have an empty dir first!
			l.logd('walking: ' + dir)
			var walkerIsEmpty = new Promise(function(resolve) {
				var isEmpty = true;
				fs.walk(dir)
				  .on('data', function (item) {
				    if (item.stats.isFile() || item.stats.isDirectory()) {
				    	//l.log('found this in the destination dir: ' + item.path)
				    	isEmpty = false;
				    }
				  })
				  .on('end', function () {
				    resolve(isEmpty)
				  })
				  .on('error', function(e) {
				  	resolve(true);
				  })
			});
			;
			if (!(yield walkerIsEmpty)) {
				throw new Error('Destination dir ('+dir+') is not empty');
			}
		}

		yield download(skeleton_repo, dir, {});
		if (!(yield fs.fileExists(path.join(dir, 'config.ergo.js')))) {
			throw new Error("'"+skeleton_repo+"' is not a valid skeleton file. It is missing 'config.ergo.js'")
		}


//		var copy = Promise.promisify(fs.copy);
//		yield copy(skeleton_dir, dir, {clobber:(options.force||false)});
		return skeleton_repo;
	})();
}

