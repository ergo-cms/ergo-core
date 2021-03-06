/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* Not for public consumption. plugins *do* have access to this however, but it is assumed for read-only purposes
*
* Other developers might also think of this as the 'environment' class.
* As such, it can also be thought of a dumping ground for 'globals'
*
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-lib-context');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs;
var path = require('path');


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

	// allow the config's 'runtime_options' section override command line
	return _.extend(options, this.config.runtime_options);
}


function _getName(filename, context) {
	return path.basename(filename).toLowerCase().replace(/\s/g, context.config['filename_space_char'] || '-');
}


function _filterLog(fileInfo, regExp) {
	try {
		return regExp.test(fileInfo.relPath);
	}
	catch (e) {
		l.logw("Unexpected failure in applying log filter: " + _.niceStackTrace(e));
		return false;
	}
}


function Context(config, config_path) {
	this.config = config;
	this.files = []; // of FileInfo (see ./fileinfo.js). Files, images & movies are here too
	this.partials = {}; // a cache of name => FileInfo
	this.layouts = {}; // a cache of name => FileInfo
	
	this.themeconfig = { // settings for themes. This is set by the theme itself. This is an example only:
		//  name: 'Bootstrap - Clean Blog'

		// Where to grab it
		//, url: 'https://github.com/BlackrockDigital/startbootstrap-clean-blog/archive/gh-pages.zip'

		// What it looks like & where it's demo is
		//, preview_image: 'https://startbootstrap.com/img/templates/clean-blog.jpg'
		//, demo_url: 'https://blackrockdigital.github.io/startbootstrap-clean-blog/'

		// Which sub-folders are important & should be copied verbatim. '*' indicates every folder below root should be copied
		asset_paths: '*' // eg, 'images,stylesheets', or 'assets', or '*' (all sub folders), OR as an Array object
	};

	this.fields = {}; // this can be updated by plugins
	this.config_path = config_path;
	this.base_path = path.dirname(config_path);
	if (_.isDefined(config['log_options']) && _.isDefined(config.log_options['match_file'])) {
		var regExp = config.log_options['match_file'];
		if (!_.isObject(regExp)) 
			regExp = new RegExp(regExp, 'i')
		l.global.setIfConditioner( _filterLog, regExp);
	}

	// try and load the themeconfig file now
	var themeconfigjs = path.join(this.getThemePath(), 'theme.ergo.js');
	if (fs.fileExistsSync(themeconfigjs)) 
	{
		try {
	    	_.extend(this.themeconfig, require(themeconfigjs));
	    	this.themeconfig.asset_paths = _.toRealArray(this.themeconfig.asset_paths, ',');

	    	// load in any default_fields into the global context...but at lowest priority
			if (_.isDefined(this.themeconfig['default_fields'])) {
				this.config.default_fields = _.extend({}, this.themeconfig['default_fields'], config['default_fields']);
			}
		}
		catch(e) {
			l.logw("Could not find theme at: " + themeconfigjs);
		}
	}
	else
	{
		if (!!this.config.theme) {
			l.loge("Cannot find theme '"+this.config.theme+"'. Ignoring")
			this.config.theme = null;
		}
	}
}

function __checkForCollisions(_this, fi) {
	var ignore = fi.usage == fi.USAGE.IGNORE;
	if (!ignore) {
		// check the existing files to see if something else exists that:
		// a) is a theme file and should be removed (/ignored)
		// b) isn't a theme file, but this file is (& should be ignored)

		// a normal file. compare each other file by their expected destination for a collision
		for (var i=_this.files.length-1; i>=0; i--) {
			var fi2 = _this.files[i];
			if (fi2.destPath == fi.destPath) {
				// conflict.
				if (fi2.isTheme) { // it needs removing 
					l.logIf(fi2, 2, "Conflicting files: '" + (fi.isTheme?"<theme>/":"")+ fi.relPath + "' and '" + (fi2.isTheme?"<theme>/":"")+ fi2.relPath + "'. The latter is removed from processing")
					_this.files.splice(i, 1);
				}
				else
				if (fi.isTheme) { // it needs removing
					ignore = true;
					l.logIf(fi2, 2, "Conflicting files: '" +  (fi.isTheme?"<theme>/":"")+ fi.relPath + "' and '" + (fi2.isTheme?"<theme>/":"")+ fi2.relPath + "'. The former is ignored from processing")
				}
				else
					throw new Error("Unexpected file collision with '" +  (fi.isTheme?"<theme>/":"")+ fi.relPath + "' and '" + (fi2.isTheme?"<theme>/":"")+ fi2.relPath + "'. Don't know how to proceed.")
				break;
			}
		}

		if (!ignore && (fi.isPartial || fi.isLayout))
		{
			var name = _getName(fi.path, _this);
			fi.canSave = false;
			var list = fi.isPartial ? _this.partials : _this.layouts;

			if (!fi.isTheme || !_.isDefined(list[name]))
				list[name] = fi;
			else
				ignore = true;
		}

		if (!ignore)
			l.logIf(fi, 2, "No conflicting files for: '" + fi.relPath + "'. destPath='"+fi.destPath+"'")
	}
}


Context.prototype.constructor = Context;
Context.prototype.addFile = function(path, stats) { // returns a Promise
	var _this = this;
	var FileInfo  = require('./fileinfo');
	var fi = FileInfo.create(path, stats, this);
	__checkForCollisions(this, fi)

	if (fi.usage == fi.USAGE.IGNORE) {
		l.logIf(fi, 2, "Ignored : '" + fi.relPath + "'")
		return false;
	}

	_this.files.push(fi); // EVERYTHING renderable/copy-able goes into the common list (including partials & templates)


	return true;
}

Context.prototype.addVirtualFile = function(fields, destRelPath, baseRenderer) {
	var _this = this;
	var FileInfo  = require('./fileinfo');
	var fi = FileInfo.createVirtual(fields, destRelPath, baseRenderer, this);
	__checkForCollisions(this, fi)

	if (fi.usage == fi.USAGE.IGNORE) {
		l.logIf(fi, 2, "Ignored virtual : '" + fi.relPath + "'")
		return false;
	}
	_this.files.push(fi); // EVERYTHING renderable/copy-able goes into the common list (including partials & templates)

	return true;
};

Context.prototype.getFileInfoByRelPath = function(relPath) {
	var ar = this.files.filter(function(fi) { return fi.relPath == relPath;})
	if (ar.length)
		return ar[0];
	else
		return null;
};


Context.prototype.getBasePath = function() { return this.base_path; };
Context.prototype.getRelSourcePath = function() { return fs.fixupPathSep(this.config.source_path) || "source";  }
Context.prototype.getRelLayoutsPath = function() { return  fs.fixupPathSep(this.config.layouts_path) || "_layouts"; };
Context.prototype.getRelPartialsPath = function() { return  fs.fixupPathSep(this.config.partials_path) || "_partials"; };
Context.prototype.getRelThemesRootPath = function() { return  fs.fixupPathSep(this.config.themes_path) || "_themes" };
Context.prototype.getRelThemePath = function() { return  path.join(this.getRelThemesRootPath(), this.config.theme || '_no_theme'); };
Context.prototype.getRelOutPath = function() { return  fs.fixupPathSep(this.config.out_path) ||  "output"; };
Context.prototype.getRelPluginsPath = function() { return  fs.fixupPathSep(this.config.plugins_path) ||  "_plugins"; };

Context.prototype.getSourcePath = function() { return path.join(this.base_path, this.getRelSourcePath()); }
Context.prototype.getLayoutsPath = function() { return path.join(this.base_path, this.getRelLayoutsPath()); }
Context.prototype.getPartialsPath = function() { return path.join(this.base_path, this.getRelPartialsPath()); }
Context.prototype.getPluginsPath = function() { return path.join(this.base_path, this.getRelPluginsPath()); }
Context.prototype.getThemesRootPath = function() { return path.join(this.base_path, this.getRelThemesRootPath()); }
Context.prototype.getThemePath = function() { return path.join(this.base_path, this.getRelThemePath()); }
Context.prototype.getThemeLayoutsPath = function() { return path.join(this.getThemePath(), "_layouts"); };
Context.prototype.getThemePartialsPath = function() { return  path.join(this.getThemePath(), "_partials"); };
Context.prototype.getOutPath = function() { return path.join(this.base_path, this.getRelOutPath()); }
//Context.prototype.filenameFixup = function(file) { return _fixupFileChars(file, this.config['filename_space_char']) }
Context.prototype.mergeRuntimeOptions = _mergeRuntimeOptions;
Context.prototype.getSafeName = function(name) {
	return _getName(name, this)
};
Context.prototype.lookupLayoutByName = function(name) {
	name = name || this.config.post_types[this.config.default_post_type]['layout'];
	return this.layouts[_getName(name, this)];
};
Context.prototype.lookupPartialByName = function(name) {
	name = _getName(name, this)
	var p = this.partials[name];
	if (p) 
		return p;
	// need to do a slower search by chopping off any extensions off the name
	// & comparing each partial we're given :`(
	for (var _name in this.partials) {
		var p = path.basename(_name, path.extname(_name))
		if (name == p)
			return this.partials[_name]
	}
	return null;
};
module.exports = Context; 

