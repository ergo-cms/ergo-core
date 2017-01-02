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

module.exports = function(dir, skeleton_dir, options) {
	if (!_.isDefined(dir))
		throw ('Command \'init\' is missing parameter \'dir\'');
	if (!_.isDefined(skeleton_dir))
		throw ('Command \'init\' is missing parameter \'skeleton_dir\'');
	options = options || {};

	l.log('Initialising \'' + dir + '\' ...')
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

		l.vlog('Copying skeleton files to destination...')
		var copy = Promise.promisify(fs.copy);
		yield copy(skeleton_dir, dir, {clobber:(options.force||false)});
		return true;
	})();
}

