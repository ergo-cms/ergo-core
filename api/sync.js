
/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'sync'
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-sync');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var sync_helper = require('../lib/sync-helper')

// promisify a few funcs we need
"dirExists,fileExists,ensureDir,emptyDir,readFile,writeFile,readdir,remove".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});


function _sync(options) {
return Promise.coroutine(function *() {
	options = options || {};
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	if (!context.config.sync)
		throw new Error("Missing 'sync' settings in config.ergo.js")

	var server = _.extend({}, context.config.sync);
	var ignore = [context.getRelOutPath(), sync_helper.SYNC_FILE];
	server.force = options.force;
	switch (server.type || 'ssh') {
		case 'ssh':
			return require('../lib/ssh-sync')(context.getBasePath(), server.path, server, ignore);
		default:
			throw new Error("Unknown sync type: " + server.type);
	}

	return true;
})();}


module.exports = {
	sync: _sync,
}