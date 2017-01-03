/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-lib-fileinfo');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var plugin = require('../api/plugin')
var Promise = require('bluebird');
// promisify a few funcs we need
"ensureDir,readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});


function _isInDir(dir, file) // is IN dir?
{
	var d = path.dirname(file);
	if (d.length<dir.length) return false; // can't be inside.
	d = d.substr(0, dir.length);
	return d.toLowerCase()==dir.toLowerCase();
}



function FileInfo(_path, stats, context) {
	this.path = _path;
	this.stats = stats;
	this.relPath = path.relative(context.getSourcePath(), this.path); // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
}
FileInfo.prototype.constructor = FileInfo;

FileInfo.prototype.load = function(context) {
	var _this = this;
	return Promise.coroutine(function *() {
		l.vlog("Loading '" + _this.relPath+ "'...")
		_this.data = yield fs.readFile(_this.path);
		var chain = plugin.buildRenderChain(_this.path, context.config); // TODO. Make options specific for the renderer?
		_this.renderers = chain.renderers;

		var pathofs = path.dirname(_this.relPath);
		_this.destFilename = chain.filename;
		_this.destRelPath = path.join(pathofs, chain.filename);  // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
		_this.destPath = path.join(context.getOutPath(), pathofs, chain.filename); 
		return true;
	})();
}
FileInfo.prototype.isRendered = function() { return !!this.renderedData; }
FileInfo.prototype.render = function(context) {
	if (!!this.renderedData)
		return; // already rendered!
	// body...
	l.vvlog("Rendering '" + this.relPath+"'...")
	var text = this.data;
	var _this = this;
	this.renderers.forEach(function(r) {
		l.logd("Rendering '"+_this.relPath+"' with '" + r.name + "'")
		text = r.render(text, _this, context);
	})
	this.renderedData = text;
};

FileInfo.prototype.canSave = function(context) { 
	//assert(this.isRendered());
	if (!this.isRendered())
		throw new Error("Unexpected. A file has been asked to save without rendering it first!"); // No reason for this exception to EVER be thrown

	 // NB: must use absolute paths, b/c relPath is relative to SOURCE path, & not basePath

	// NB: A plugin might want to load from somewhere else altogether and save it somewhere appropriate.
	// We don't jump through hoops here to make sure the source path is *actually* in the source folder.
	// but we do make sure that it's not a _layout or _partial	 
	if (_isInDir(context.getLayoutsPath(), this.path) || 
		_isInDir(context.getPartialsPath(), this.path))
		return false;

	if (!_isInDir(context.getOutPath(), this.destPath)) {
		l.logd("Output folder is: " + context.getOutPath())
		l.logw("Attempt to save a file outside the output folder!\nThe offending file is: " + this.destPath + "\n...and was loaded from: " + this.path);
		return false;
	}

	return true;

}
FileInfo.prototype.save = function(context) {
	var _this = this;

	return Promise.coroutine(function *() {
		if (!_this.canSave || !_this.canSave(context)) {// NB: we allow plugins to make mistakes and set canSave = false... but ONLY false!
			l.vvlog("Skipping save for '" + _this.relPath+"'")
			return false;
		}

		l.vlog("Saving '" + _this.relPath+"' as '"+_this.destRelPath+"'...")
		yield fs.ensureDir(path.dirname(_this.destPath));
		yield fs.writeFile(context.filenameFixup(_this.destPath), _this.renderedData);
		l.vvlog("Write OK")
		return true;
	})();
};


module.exports = FileInfo;