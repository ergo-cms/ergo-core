/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-lib-fileinfo');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
const assert = require('assert');
var plugin = require('../api/plugin')
var Promise = require('bluebird');
// promisify a few funcs we need
"ensureDir,readFile,writeFile,copy".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});


function _fixupFilenameChars(str, space_char_replace) { // make sure the path is pointing the right way for the platform (windows/'nix)
	str = fs.fixupPathSep(str).toLowerCase();
	var dir = path.dirname(str); // assume dirs DON'T need fixing! (Probably a safe assumption)
	str = path.basename(str).replace(/\s/g, space_char_replace || '-');
	return path.join(dir, str);
}


function FileInfo(_path, stats, context) {
	this.path = _path;
	this.stats = stats;
	this.relPath = path.relative(context.getSourcePath(), this.path); // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
	this.fields = {content:null}; // eg. fields are added in here. eg. this.fields.title is a page's title (generally)
	this.renderers = [];
}

FileInfo.prototype.constructor = FileInfo;

FileInfo.prototype.load = function(context) {
	var _this = this;
	return Promise.coroutine(function *() {
		// based on filename / location / whatev's work out what renderers will be involved.
		var chain = plugin.buildRenderChain(_this.path, context.config); 
		_this.renderers = chain.renderers;

		// calc the destination name
		var pathofs = path.dirname(_this.relPath).toLowerCase(); // lowercase is best for all destination files
		_this.destFilename = _fixupFilenameChars(chain.filename, context.config['filename_space_char']);
		_this.destRelPath = path.join(pathofs, _this.destFilename);  // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
		_this.destPath = path.join(context.getOutPath(), pathofs, _this.destFilename); 

		_this.isLayout = _this.isInDir(context.getLayoutsPath());
		_this.isPartial = _this.isInDir(context.getPartialsPath());

		// Work out whether we need to process it through the plugin system at all.
		// if not, just copy to the destination and be done with it!
		if (_this.renderers.length==0 && !(_this.isLayout || _this.isPartial)) {
			// there is nothing to transform this.
			l.log("Copying '" + _this.relPath + "' to '" + _this.destRelPath + "'...");
			yield fs.copy(_this.path, _this.destPath);

			// Make sure we flag that we've done everything
			_this.fields.content = null;
			_this.canSave = false; // changing the function to a false boolean is supported in this api.
			return false;
		}
		else
		{
			l.vlog("Loading '" + _this.relPath+ "'...")
			_this.fields.content = yield fs.readFile(_this.path);
			return true;
		}
		
	})();
}

FileInfo.prototype.canRender = function(context) {
	return this.renderers.length>0 && this.fields && this.fields.content;
};
FileInfo.prototype.renderNext = function(context) {
	if (this.canRender===false || !this.canRender(context))
		return false;

	var r = this.renderers[0];
	if (r.name!='dummy') l.logd("Rendering '"+this.relPath+"' with '" + r.name + "'")
	this.fields.content = r.render(this.fields, this, context); 
	this.renderers.splice(0,1);
	return this.canRender(context);
};

/*
__renderStage(_this, label, funcName, context) {
	if (_this.renderers.length>0 && _this.fields && _this.fields.content) {
		// body...
		l.vvlog(label+" '" + _this.relPath+"'...")
		var r = _this.renderers[0];
		l.logd(label+" '"+_this.relPath+"' with '" + r.name + "'")
		_this.fields.content r[funcName].call(r, _this.fields.content, _this.fields, _this, context); // eg. r.render(...), or r.preRender(...)
	}
}

FileInfo.prototype.preRender = function(context) {
	return __renderStage(this, "Pre-Rendering", "preRender", context);
};
FileInfo.prototype.render = function(context) {
	return __renderStage(this, "Rendering", "render", context);
};
FileInfo.prototype.postRender = function(context) {
	return __renderStage(this, "Post-Rendering", "postRender", context);
};
*/

FileInfo.prototype.canSave = function(context) { 
	// NB: This system allows this.canSave === false as well.

	if (!fs.isInDir(context.getOutPath(), this.destPath)) {
		l.logd("Output folder is: " + context.getOutPath())
		l.logw("Attempt to save a file outside the output folder!\nThe offending file is: " + this.destPath + "\n...and was loaded from: " + this.path);
		return false;
	}

	return !!this.fields && !!this.fields.content && !this.canRender();
}

FileInfo.prototype.save = function(context) {
	var _this = this;

	return Promise.coroutine(function *() {
		if (_this.canSave===false || !_this.canSave(context)) {// NB: we allow plugins to set 'canSave = false'... but ONLY false! Useful for layouts & partials
			l.vvlog("Skipping save for '" + _this.relPath+"'")
			return false;
		}

		l.vlog("Saving '" + _this.relPath+"' as '"+_this.destRelPath+"'...")
		yield fs.ensureDir(path.dirname(_this.destPath));
		yield fs.writeFile(_this.destPath, _this.fields.content);
		l.vvlog("Write OK")
		return true;
	})();
};

FileInfo.prototype.isRelInDir = function(relDir) { return fs.isInDir(relDir, this.relPath); }
FileInfo.prototype.isInDir = function(dir) { return fs.isInDir(dir, this.path); }



module.exports = FileInfo;