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


const CONFIG_NAME = 'config.ergo.js';

/*
a Config layout:

var config = {
	  source_path: "source"
	, layouts_path: "source/_layouts"
	, partials_path: "source/_partials"
	, out_path: "output"
	, plugins_path: "source/_plugins"  // these are generally links to 'node_modules' folder
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
	
	, plugin_options: {
		  textile: { breaks: false }
		, markdown: { ... }
	}
}
*/

function Config(config, config_path, options) {
	this.config = config;
	this.options = _.extend({}, config.runtime_options); // apply new 'default' runtime options
	this.options = _.extend(this.options, options||{}); // apply new current
	this.config_path = config_path;
	this.base_path = path.dirname(config_path);
}

Config.prototype.constructor = Config;
Config.prototype.getBasePath = function() { return this.base_path; };
Config.prototype.getRelSourcePath = function() { return _fixupPathSep(this.config.source_path) || "source";  }
Config.prototype.getRelLayoutsPath = function() { return  _fixupPathSep(this.config.layouts_path) || path.join(this.getRelSourcePath(), "_layouts"); };
Config.prototype.getRelPartialsPath = function() { return  _fixupPathSep(this.config.partials_path) || path.join(this.getRelSourcePath(), "_partials"); };
Config.prototype.getRelOutPath = function() { return  _fixupPathSep(this.config.out_path) ||  "output"; };

Config.prototype.getSourcePath = function() { return path.join(this.base_path, this.getRelSourcePath()); }
Config.prototype.getLayoutsPath = function() { return path.join(this.base_path, this.getRelLayoutsPath()); }
Config.prototype.getPartialsPath = function() { return path.join(this.base_path, this.getRelPartialsPath()); }
Config.prototype.getOutPath = function() { return path.join(this.base_path, this.getRelOutPath()); }


function _fixupPathSep(str) { // make sure the path is pointing the right way for the platform (windows/'nix)
	if (str)
		return str.replace(/\\/g,path.sep).replace(/\//g,path.sep);
	else 
		return str;
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
function __getConfig(configjs, options) { // always syncronous, due to require(configjs)
	options = options || {};

	if (!configjs) {
		l.logw('Configuration file not found.')
		return null;
	}
    try {
    	var config = require(configjs);
	    return new Config(config, configjs, options);
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
