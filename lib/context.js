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
var path = require('path');
var FileInfo  = require('./fileinfo');

function _fixupPathSep(str) { // make sure the path is pointing the right way for the platform (windows/'nix)
	if (str)
		return str.replace(/\\/g,path.sep).replace(/\//g,path.sep);
	else 
		return str;
}
function _fixupFileChars(str, space_char_replace) { // make sure the path is pointing the right way for the platform (windows/'nix)
	str = _fixupPathSep(str);
	var dir = path.dirname(str); // assume dirs DON'T need fixing! (Probably a safe assumption)
	str = path.basename(str).replace(/\s/g, space_char_replace || '-');
	return path.join(dir, str);
}

function _mergeRuntimeOptions(options) {
	var mergeable = "verbose,quiet,debug,log_options".split(',');
	var _this = this;
	mergeable.forEach(function(prop) {
		if (_.isDefined(_this.config[prop]))
			options[prop] = _this.config[prop];
	});
	l.init(options);

}




function Context(config, config_path) {
	this.config = config;
	this.files = []; // of FileInfo (see ./fileinfo.js)
	this.config_path = config_path;
	this.base_path = path.dirname(config_path);
}

Context.prototype.constructor = Context;
Context.prototype.addFile = function(path, stats) {
	var _this = this;
	var fi = new FileInfo(path, stats, this);
	return fi.load(_this).then(function(){
		_this.files.push(fi);
		return true;
	})
}

Context.prototype.getBasePath = function() { return this.base_path; };
Context.prototype.getRelSourcePath = function() { return _fixupPathSep(this.config.source_path) || "source";  }
Context.prototype.getRelLayoutsPath = function() { return  _fixupPathSep(this.config.layouts_path) || path.join(this.getRelSourcePath(), "_layouts"); };
Context.prototype.getRelPartialsPath = function() { return  _fixupPathSep(this.config.partials_path) || path.join(this.getRelSourcePath(), "_partials"); };
Context.prototype.getRelOutPath = function() { return  _fixupPathSep(this.config.out_path) ||  "output"; };
Context.prototype.getRelPluginsPath = function() { return  _fixupPathSep(this.config.plugins_path) ||  "plugins"; };

Context.prototype.getSourcePath = function() { return path.join(this.base_path, this.getRelSourcePath()); }
Context.prototype.getLayoutsPath = function() { return path.join(this.base_path, this.getRelLayoutsPath()); }
Context.prototype.getPartialsPath = function() { return path.join(this.base_path, this.getRelPartialsPath()); }
Context.prototype.getPluginsPath = function() { return path.join(this.base_path, this.getRelPluginsPath()); }
Context.prototype.getOutPath = function() { return path.join(this.base_path, this.getRelOutPath()); }
Context.prototype.filenameFixup = function(file) { return _fixupFileChars(file, this.config['filename_space_char']) }
Context.prototype.mergeRuntimeOptions = _mergeRuntimeOptions;

module.exports = Context; 

