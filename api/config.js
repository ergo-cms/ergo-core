/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'config' related helpers.
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-config');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var parentFindFile = Promise.promisify(fs.parentFindFile);


const CONFIG_NAME = 'config.js';

const _default_config = {
	  source_dir: 'source'
	, layouts_dir: path.join('source','_layouts')
	, partials_dir: path.join('source','_partials')
	, plugins: {
// ? maybe handlers for these should be somewhere... so that it's easier to register in config.js
// OOOORRRRR. this should be in package.json ! ??
		"ergo-renderer-md": "latest"
		,"ergo-renderer-latext": "latest"
	}
}



function _findConfigFilenameSync(working_dir) { // returns null if not found
	working_dir = working_dir || process.cwd();
	l.logd('Searching for config.js in ' + working_dir)
	return fs.parentFindFileSync(working_dir, CONFIG_NAME);
}

function _findConfigFilename(working_dir) { // returns null if not found
	working_dir = working_dir || process.cwd();
	l.logd('Searching for config.js in ' + working_dir)

	return parentFindFile(working_dir, CONFIG_NAME);
}

function __getConfig(configjs, options) {
	options = options || {};

	if (!configjs) {
		l.logw('Configuration file not found.')
		return null;
	}
    try {
    	var config = require(configjs);
	    config.base_dir = path.dirname(configjs);
	    config.runtime_options = _.extend({}, options);
	    return config;
	}
	catch (e) {
		l.loge("Cannot log config:\n"+_.niceStackTrace(e))
		throw e;
	}
}

function _getConfigSync(working_dir, options)
{
	if (_.isObject(working_dir) && !_.isDefined(options)) {
		// the OP used _getConfigSync({})
		options = working_dir;
		working_dir = undefined;
	}

	return __getConfig(
		_findConfigFilenameSync(working_dir),
		options);
}
function _getConfig(working_dir, options) // async version
{
	if (_.isObject(working_dir) && !_.isDefined(options)) {
		// the OP used _getConfigSync({})
		options = working_dir;
		working_dir = undefined;
	}

	return _findConfigFilename(working_dir)
		.then(function(configjs) {
			return __getConfig(configjs, options) // unfortunately, this is a sync' operation only
		})
}




var _config = {
	  getConfigP: _getConfig // 'Promised' version
	, getConfigSync: _getConfigSync
	, findConfigFilenameP: _findConfigFilename // 'Promised' version
	, findConfigFilenameSync: _findConfigFilenameSync
};


module.exports = _config;
