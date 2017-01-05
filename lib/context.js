/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* Not for public consumption. plugins *do* have access to this however, but it is assumed for read-only purposes
*
* Other developers might also think of this as the 'environment' class.
*
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-lib-context');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs;
var path = require('path');
var FileInfo  = require('./fileinfo');


function _mergeRuntimeOptions(options) {
	// this is called (eg. from 'build') to incorporate any commandline options, eg --verbose --quiet, etc
	var mergeable = "verbose,quiet,debug,log_options".split(',');
	var _this = this;
	var o = {}
	mergeable.forEach(function(prop) {
		if (_.isDefined(options[prop]))
			o[prop] = options[prop];
	});
	_.extend(_this.config, o);
	l.init(_this.config);

}


function _getName(filename) {
	return path.basename(filename).toLowerCase();
}




function Context(config, config_path) {
	this.config = config;
	this.files = []; // of FileInfo (see ./fileinfo.js). Files, images & moves are here
	this.partials = {}; // a cache of name => FileInfo
	this.layouts = {}; // a cache of name => FileInfo
	this.fields = {}; // this can be updated by plugins
	this.config_path = config_path;
	this.base_path = path.dirname(config_path);
}

Context.prototype.constructor = Context;
Context.prototype.addFile = function(path, stats) { // returns a Promise
	var _this = this;
	var fi = new FileInfo(path, stats, this);
	return fi.load(_this).then(function(load_result){
		if (!load_result)
			// the file was copied directly. As far as we're concerned. we can ignore it now.
			return;

		_this.files.push(fi); // EVERYTHING renderable goes into the common list (including partials & templates)

		if (fi.isLayout)  {
			var name = _getName(fi.path); // we use destPath so that spaces & uppercases are removed.
			_this.layouts[name] = fi;
			fi.canSave = false;
		}
		else if (fi.isPartial) {
			var name = _getName(fi.path);
			_this.partials[name] = fi;
			fi.canSave = false;

		}

		return fi;
	})
}

Context.prototype.getBasePath = function() { return this.base_path; };
Context.prototype.getRelSourcePath = function() { return fs.fixupPathSep(this.config.source_path) || "source";  }
Context.prototype.getRelLayoutsPath = function() { return  fs.fixupPathSep(this.config.layouts_path) || path.join(this.getRelSourcePath(), "_layouts"); };
Context.prototype.getRelPartialsPath = function() { return  fs.fixupPathSep(this.config.partials_path) || path.join(this.getRelSourcePath(), "_partials"); };
Context.prototype.getRelOutPath = function() { return  fs.fixupPathSep(this.config.out_path) ||  "output"; };
Context.prototype.getRelPluginsPath = function() { return  fs.fixupPathSep(this.config.plugins_path) ||  "plugins"; };

Context.prototype.getSourcePath = function() { return path.join(this.base_path, this.getRelSourcePath()); }
Context.prototype.getLayoutsPath = function() { return path.join(this.base_path, this.getRelLayoutsPath()); }
Context.prototype.getPartialsPath = function() { return path.join(this.base_path, this.getRelPartialsPath()); }
Context.prototype.getPluginsPath = function() { return path.join(this.base_path, this.getRelPluginsPath()); }
Context.prototype.getOutPath = function() { return path.join(this.base_path, this.getRelOutPath()); }
//Context.prototype.filenameFixup = function(file) { return _fixupFileChars(file, this.config['filename_space_char']) }
Context.prototype.mergeRuntimeOptions = _mergeRuntimeOptions;
Context.prototype.lookupLayoutByName = function(name) {
	return this.layouts[_getName(name)] || this.layouts[_getName(this.config.post_types[this.config.default_post_type]['item_template'])];
};

module.exports = Context; 

