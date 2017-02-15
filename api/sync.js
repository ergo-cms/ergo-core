
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
var path = require('path');
var Promise = require('bluebird');
var sync_helper = require('../lib/sync-helper')



function _sync(options) {
return Promise.coroutine(function *() {
	options = options || {};
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	if (!context.config.project_sync)
		throw new Error("Missing 'project_sync' settings in config.ergo.js")

	var connection = _.extend({}, context.config.project_sync);
	var syncOptions = {
		//direction: sync_helper.UPLOAD,
		direction: undefined, // === Bi-directional
		ignore: [context.getRelOutPath(), sync_helper.SYNC_FILE],
		force: options.force,
		connection: connection,
	}
	switch (connection.type || 'ssh') {
		case 'ssh':
			return require('../lib/ssh-sync')(context.getBasePath(), connection.path, syncOptions);
		default:
			throw new Error("Unknown sync type: " + server.type);
	}

	return true;
})();
}



function _deploy(options) {
return Promise.coroutine(function *() {
	options = options || {};
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	if (!context.config.deploy)
		throw new Error("Missing 'deploy' settings in config.ergo.js")

	var connection = _.extend({}, context.config.deploy);
	var syncOptions = {
		direction: sync_helper.UPLOAD,
		ignore: [sync_helper.SYNC_FILE],
		force: options.force,
		connection: connection,
	}
	switch (connection.type || 'ssh') {
		case 'ssh':
			return require('../lib/ssh-sync')(context.getOutPath(), connection.path, syncOptions);
		default:
			throw new Error("Unknown sync type: " + server.type);
	}

	return true;
})();
}


module.exports = {
	sync: _sync,
	deploy: _deploy,
}