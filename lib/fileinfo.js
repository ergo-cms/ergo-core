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
var Promise = require('bluebird');
// promisify a few funcs we need
"fileExists,stat,ensureDir,readFile,writeFile,copy".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});


function _fixupFilenameChars(str, space_char_replace) { // make sure the path is pointing the right way for the platform (windows/'nix)
	str = fs.fixupPathSep(str).toLowerCase();
	var dir = path.dirname(str); // assume dirs DON'T need fixing! (Probably a safe assumption)
	str = path.basename(str).replace(/\s/g, space_char_replace || '-');
	return path.join(dir, str);
}

//var _ThisBuild = new Date();

function _shouldKeepExisting(file, text)
{
return Promise.coroutine(function *() {
	if (!(yield fs.fileExists(file)))
		return false;

//	var st = yield fs.stat(file);
//	if (st > _ThisBuild)
//		l.logw("File is used multiple times: '" + file)+"'");

	// read the existing file and compare with new contents. ignore if nothing changed
	try
	{
		var existingText = yield fs.readFile(file, "utf8");
		if (existingText == text)
		{
			//l.vlog("Skipping (unchanged): '" + file + "'");
			return true;
		}
	}
	catch (e)
	{
		l.logw("Failed to compare existing file " + path.basename(file) + " (will try and overwrite): " + _.niceStackTrace(e));
		// and continue below...
	}
	return false;
})();
}

const USAGE = {
	IGNORE: -1,
	COPY: 1,
	PROCESS: 2
}

function __determineUsage(_this, context){ // this==FileInfo. Done like this to keep functionality private.

	// based on filename / location / whatev's, work out what renderers will be involved.
	var plugin_api = require('../api/plugin')
	var chain = plugin_api.renderChainFromFile(_this.path, context.config); 
	_this.renderers = chain.renderers;

	// make the layout & partial relPaths look like: _layouts/xyz.html
	// (NB: This is done b/c LayoutPath can actually be *anywhere*. So, this is a normalisation process,
		// so that we can compare layout files against theme layout files)
	if (!_this.isTheme && _this.isLayout)
		_this.relPath = path.join("_layouts", path.relative(context.getLayoutsPath(), _this.path)); 
	if (!_this.isTheme && _this.isPartial)
		_this.relPath = path.join("_partials", path.relative(context.getPartialsPath(), _this.path)); 
	// make theme relPath relative to its theme folder
	if (_this.isTheme)
		_this.relPath = path.relative(context.getThemePath(), _this.path); 

		
	// calc the destination name
	var pathofs = path.dirname(_this.relPath).toLowerCase(); // lowercase is best for all destination files
	_this.destFilename = _fixupFilenameChars(chain.filename, context.config['filename_space_char']);
	_this.destRelPath = path.join(pathofs, _this.destFilename);  // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
	_this.destPath = path.join(context.getOutPath(), pathofs, _this.destFilename); 

	var inThemesRoot = _this.isInDir(context.getThemesRootPath());

	var file_usage = USAGE.IGNORE; // -1=ignore as if it doesn't exist, 1=write to dest, 2=usable, so load it.

	if (inThemesRoot && !_this.isTheme) 
	{
		// this is NOT for the current theme. ALL files like this must be ignored!
		// deliberately IGNORE anything in _themes folder that ISN"T part of current theme.
	}
	else if (_this.isTheme)
	{


		// generally, files in the theme path are to be ignored.

		// The exceptions are: 
		//		- *if* they are _layouts or _partials, they get loaded
		//		- *if* they are in the the 'assets_path' AND won't overwrite an existing source file, they get copied.

		if (_this.isPartial || _this.isLayout) {
			file_usage = USAGE.PROCESS; // load it
		}
		else {
			// work out if we can copy this file to the dest
			var asset_paths = context.themeconfig.asset_paths;
			if (asset_paths[0]=='*') {
				if (_this.destRelPath.indexOf(path.sep)>0)
					// in a subfolder. copy
					file_usage = USAGE.COPY;
				//else, skip it!
				asset_paths = asset_paths.slice(1);
			}

			if (file_usage==USAGE.IGNORE)
				asset_paths.forEach(function(folder) { // eg. 'css', 'images', etc
					if (fs.isInDir(folder, _this.relPath) || // in a correct subfolder
							folder == _this.relPath)  // or explicitly mentioned 
						file_usage = USAGE.COPY;
				});

		}

	}
	else
	{
		// Work out whether we need to process it through the plugin system at all.
		// if not, just copy to the destination and be done with it!
		if (_this.renderers.length==0 && !(_this.isLayout || _this.isPartial)) {
			// there is nothing to transform this.
			file_usage = USAGE.COPY; // copy it
		}
		else
		{
			file_usage = USAGE.PROCESS; // load it.
		}
	}
	_this.usage = file_usage;
}




function _init(_this, _path, stats, context) {
	if (_.isObject(_path)) {
		// we've been given a virtual fileObject
	}
	_this.path = _path;
	_this.stats = stats;

	_this.isLayout = _this.isInDir(context.getLayoutsPath()) || _this.isInDir(context.getThemeLayoutsPath());
	_this.isPartial = _this.isInDir(context.getPartialsPath()) || _this.isInDir(context.getThemePartialsPath());
	_this.isTheme = _this.isInDir(context.getThemePath());

	_this.relPath = path.relative(context.getSourcePath(), _this.path); // NB: relPath is relative to SOURCE path, not basePath like everything in context obj

	_this.fields = {content:null}; // eg. fields are added in here. eg. _this.fields.title is a page's title (generally)
	_this.renderers = [];
	__determineUsage(_this, context);
	l.logdIf(_this, 2, "Fileinfo '" + _this.relPath + "': isLayout("+_this.isLayout+"), isPartial("+_this.isPartial+"), isTheme("+_this.isTheme+"), usage("+_this.usage+")")
}

function _initVirtual(_this, fields, destRelPath, baseRenderer, context) {
	if (!fields || !fields.content)
		throw new Error("Invalid fields for virtualFile");

	var plugin_api = require('../api/plugin')

	// 
	_this.isPartial = _this.isLayout = false; // non-includeable
	_this.isTheme = true; // aka it's a non-user defined file, thereby overwriteable
	_this.stats = fs.statSync(__filename);
	_this.path = path.join(context.getSourcePath(), destRelPath); // not really true
	_this.relPath = destRelPath;
	_this.destRelPath = destRelPath;
	_this.destFilename = _fixupFilenameChars(path.basename(destRelPath), context.config['filename_space_char']);
	_this.destPath = path.join(context.getOutPath(), destRelPath); 
	_this.fields = fields;
	var chain = plugin_api.renderChainFromRendererNames(baseRenderer, context.config); 
	_this.renderers = chain.renderers;
	_this.usage = USAGE.PROCESS;
}


function FileInfo() {


}

FileInfo.prototype.constructor = FileInfo;

FileInfo.prototype.loadOrCopy = function(context) {
	var _this = this;
	return Promise.coroutine(function *() {

		switch(_this.usage) {

			case USAGE.PROCESS: // load it
				l.vlog("Loading '" + (_this.isTheme ? "<theme>/":"") + _this.relPath+ "'...")
				_this.fields.content = yield fs.readFile(_this.path);
				return true;

			case USAGE.COPY: // copy it to dest & do nothing more
				l.log("Copying '" + (_this.isTheme ? "<theme>/":"") + _this.relPath + "' to '" + _this.destRelPath + "'...");
				yield fs.copy(_this.path, _this.destPath, {preserveTimestamps:true});

				// fall thru to to default...

			default:
				// Make sure we flag that we've finished with it
				_this.fields.content = null;
				_this.canSave = false; // changing the function to a false boolean is supported in this api.
				return false; // don't try & process this file any more: it's dealt with
		}
	})();
}

FileInfo.prototype.canRender = function(context) {
	return this.renderers.length>0 && !!this.fields && !!this.fields.content;
};

/*function elapsed(startTime) {
	var elapsed = Date.now()-startTime;
	return (elapsed>100 ? l._colors.Bright : l._colors.Dim) + l._colors.FgYellow + '('+elapsed+'ms)' + l._colors.Reset; 
}*/
FileInfo.prototype.renderNext = function(context) {
	if (this.canRender===false || !this.canRender(context))
		return false;
//	var startTime = Date.now();

	var r = this.renderers[0];
	if (r.name!='dummy') l.logdIf(this, 0, "Rendering '"+(this.isTheme ? "<theme>/":"") + this.relPath+"' with '" + r.name + "'")
	this.fields.content = r.render(this.fields, this, context); 
	if (r.name!='dummy') l.logdIf(this, 2, "    Content of '"+(this.isTheme ? "<theme>/":"") + this.relPath+"' is: " + this.fields.content.substr(0,300))
	if (r.name!='dummy' && !_.isEmptyString(this.fields['template_content'])) l.logdIf(this, 2, "   Template content of '"+(this.isTheme ? "<theme>/":"") + this.relPath+"' is: " + this.fields.template_content.substr(0,300))
	this.renderers.splice(0,1);
//	l.log("Execution Time " + elapsed(startTime) + " '" + this.relPath+"'")
	return this.canRender(context);
};



FileInfo.prototype.canSave = function(context) { 
	// NB: This system allows this.canSave === false as well.
	if (this.usage != USAGE.PROCESS)
		return false;

	if (!fs.isInDir(context.getOutPath(), this.destPath)) {
		l.logd("Output folder is: " + context.getOutPath())
		l.logw("Attempt to save a file outside the output folder!\nThe offending file is: " + this.destPath + "\n...and was loaded from: " + this.path);
		return false;
	}

	return this.fields && ((!!this.fields.content||!!this.fields.template_content) || this.canRender());
}

FileInfo.prototype.save = function(context) {
	var _this = this;

	return Promise.coroutine(function *() {
		if (_this.canSave===false || !_this.canSave(context)) {// NB: we allow plugins to set 'canSave = false'... but ONLY false! Useful for layouts & partials
			if (_this.usage != USAGE.COPY && !_this.isPartial && !_this.isLayout && !_this.isTheme) 
				l.log("Skipping save for '" + _this.relPath+"'")
			return false;
		}

		yield fs.ensureDir(path.dirname(_this.destPath));
		var template = !!_this.fields.template_content;
		var contents = template ? _this.fields.template_content : _this.fields.content;
		if ((yield _shouldKeepExisting(_this.destPath, contents))) {
			l.log("Skipping unchanged '" + (_this.isTheme ? "<theme>/":"") + _this.relPath+"'")
			return false;
		}


		l.log("Saving "+(template?"(templated) ":"") +"'" + (_this.isTheme ? "<theme>/":"") + _this.relPath+"' as '"+_this.destRelPath+"'...")
		yield fs.writeFile(_this.destPath, contents);
		l.vlog("Write OK")
		return true;
	})();
};

FileInfo.prototype.isRelInDir = function(relDir) { return fs.isInDir(relDir, this.relPath); }
FileInfo.prototype.isInDir = function(dir) { return fs.isInDir(dir, this.path); }
FileInfo.prototype.USAGE = USAGE;
FileInfo.create = function(path, stats, context) {
	var fi = new FileInfo();
	_init(fi, path, stats, context);
	return fi;
}
FileInfo.createVirtual = function(fields, destRelPath, baseRenderer, context) {
	var fi = new FileInfo();
	_initVirtual(fi, fields, destRelPath, baseRenderer, context);
	return fi;
}


module.exports = FileInfo;


