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
var Context = require('../lib/context');


const CONFIG_NAME = 'config.ergo.js';

/*
a Config layout:

var config = {
	  source_path: "source"
	, layouts_path: "source/_layouts"
	, partials_path: "source/_partials"
	, out_path: "output"
	, plugins_path: "plugins"  // these are generally links to 'node_modules' folder
	, filename_space_char: '-'  // 'when we find this.html' we change it to this: 'when-we-find-this.html'

	, runtime_options: {
		  verbose: 0
		, quiet: true
		...
	}

	, default_properties: {
		  site_url: "http://demosite.example.com"
		, site_title: "A Demo Site" 	// used in rss feeds, etc
		, title: "A Demo Site - "		// changed by each page, is the <title> block
		, author: "Demo Author"			// the default author, if needed
	}
	
	, plugins: "simpletag,textile,marked"
	, plugin_options: {
		  textile: { breaks: false }
		, marked: { ... }
	}
}
*/


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

var _singleton_context = null;

function __getContext(configjs) { // always syncronous, due to require(configjs)
	if (_singleton_context) {
		l.logw("Attempt to find a new context, when one has already been created!")
		return _singleton_context; // return the previously found context
	}

	if (!configjs) {
		l.logw('Configuration file not found.')
		return null;
	}
    try {
    	var config = require(configjs);
	    _singleton_context = new Context(config, configjs);
	    return _singleton_context;
	}
	catch (e) {
		l.loge("Cannot log config:\n"+_.niceStackTrace(e))
		throw e;
	}
}

function _getContextSync(working_dir)
{
	if (_singleton_context) {
		l.logw("Attempt to find a new context, when one has already been created!")
		return _singleton_context; // return the previously found context
	}

	return __getContext(_findConfigFilenameSync(working_dir));
}
function _getContext(working_dir) // async version
{
	if (_singleton_context) {
		l.logw("Attempt to find a new context, when one has already been created!")
		return Promise.resolve(_singleton_context);
	}

	return _findConfigFilename(working_dir)
		.then(function(configjs) {
			return __getContext(configjs) // unfortunately, this is a sync' operation only
		})
}




var _config = {
	  getContextP: _getContext // 'Promised' version
	, getContextSync: _getContextSync
	, findConfigFilenameP: _findConfigFilename // 'Promised' version
	, findConfigFilenameSync: _findConfigFilenameSync
};


module.exports = _config;
