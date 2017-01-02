
/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/


"use strict";

var fs = require('fs');
var path = require('path');
var _ = require('ergo-utils')._;
var l = require('ergo-utils').log.module('ergo-core-api-index');

/*
Each file in this dir is expected to be part of the 'public' api.
*/

module.exports = buildApi();

function buildApi() {
	var api = {};
	fs.readdirSync(__dirname).forEach(function(file) {
		if (file!='index.js' && path.extname(file)=='.js') { // ignore this file, but include all other js
			file = path.basename(file, '.js'); // chop off the .js
			try {
				api[file] = require('./'+file); // export the included file
			}
			catch(e) {
				l.loge("Failed to load api for '"+file+"': \n" + _.niceStackTrace(e));
				throw e; // deliberately propogate this. This is a DEV fault & need be discovered early
			}
		}
	});
	return api;
}




