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

		_this.isLayout = _this.isInDir(context.getLayoutsPath()) || _this.isInDir(context.getThemeLayoutsPath());
		_this.isPartial = _this.isInDir(context.getPartialsPath()) || _this.isInDir(context.getThemePartialsPath());
		_this.isTheme = _this.isInDir(context.getThemePath());
		var inThemesRoot = _this.isInDir(context.getThemesRootPath());
			// this is NOT for the current theme. ALL files like this must be ignored!

		var file_usage = -1; // -1=ignore as if it doesn't exist, 1=write to dest, 2=usable, so load it.

		if (inThemesRoot && !_this.isTheme) 
		{
			// deliberately IGNORE anything in _themes folder that ISN"T part of current theme.
		}
		else if (_this.isTheme)
		{
			// theme files are placed in the root of the output folder
			_this.themeRelPath = path.relative(context.getThemePath(), _this.path); // NB: relThemePath is relative to THEME path, not basePath nor SOURCE, like everything in context obj
			var themepathofs = path.dirname(_this.themeRelPath).toLowerCase(); // this is the 'subfolder' of the theme folder that it exists in.

			// remove traces of the theme path from the dest Paths.
			_this.destRelPath = path.join(themepathofs, _this.destFilename);  // NB: relPath is relative to SOURCE path, not basePath like everything in context obj
			_this.destPath = path.join(context.getOutPath(), themepathofs, _this.destFilename); 


			// generally, files in the theme path are to be ignored.

			// The exceptions are: 
			//		- *if* they are _layouts or _partials, they get loaded
			//		- *if* they are in the the 'assets_path' AND won't overwrite an existing source file, they get copied.

			if (_this.isPartial || _this.isLayout) {
				file_usage = 2; // load it
			}
			else {
				// work out if we can copy this file to the dest
				if (context.themeconfig.asset_paths[0]=='*') {
					if (_this.destRelPath.indexOf(path.sep)>0)
						// in a subfolder. copy
						file_usage = 1;
					//else, skip it!
				}
				else
				{
					context.themeconfig.asset_paths
						.forEach(function(folder) { // eg. 'css', 'images', etc
							if (fs.isInDir(folder, _this.themeRelPath) || // in a correct subfolder. copy
									folder == _this.themeRelPath)  // or explicitly mentioned 
								file_usage = 1;
						});
				}

				// Now, triple check that if we're copying there's no equivalent file in the source tree:

				// NB: There's an inherant bug here:
				//	- we generally use _fixupFilenameChars() transform a source file into all lowercase & to remove spaces, etc.
				//  - it *is* conceivable that "File 1.jpg" and "fiLE-1.jpg" will BOTH end up being written to the same location ('file1-1.jpg')
				//   (In this instance, it's a LAST MAN WINS)
				//		The FIX is to put all the files we're about to copy and then compare by destination. before actually copying
				// NB: Other systems ALSO have this issue:
				//		(eg. index.tem.html and index.md and index.tex all become index.html)
				// TODO. Fix
				if (file_usage==1 && fs.fileExistsSync(path.join(context.getSourcePath(), _this.themeRelPath)))
					// already exists in the source. DON'T use it.
					file_usage = -1;
			}

		}
		else
		{
			// Work out whether we need to process it through the plugin system at all.
			// if not, just copy to the destination and be done with it!
			if (_this.renderers.length==0 && !(_this.isLayout || _this.isPartial)) {
				// there is nothing to transform this.
				file_usage = 1; // copy it
			}
			else
			{
				file_usage = 2; // load it.
			}
		}

		switch(file_usage) {

			case 2: // load it
				l.vlog("Loading '" + _this.relPath+ "'...")
				_this.fields.content = yield fs.readFile(_this.path);
				return true;

			case 1: // copy it to dest & do nothing more
				l.log("Copying '" + _this.relPath + "' to '" + _this.destRelPath + "'...");
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
	return this.renderers.length>0 && this.fields && this.fields.content;
};
FileInfo.prototype.renderNext = function(context) {
	if (this.canRender===false || !this.canRender(context))
		return false;

	var r = this.renderers[0];
	if (r.name!='dummy') l.logdIf(this, 0, "Rendering '"+this.relPath+"' with '" + r.name + "'")
	this.fields.content = r.render(this.fields, this, context); 
	if (r.name!='dummy') l.logdIf(this, 2, "   Content of '"+this.relPath+"' is: " + this.fields.content.substr(0,300))
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
			l.vlog("Skipping save for '" + _this.relPath+"'")
			return false;
		}

		yield fs.ensureDir(path.dirname(_this.destPath));
		var template = !!_this.fields.template_content;
		var contents = template ? _this.fields.template_content : _this.fields.content;
		if ((yield _shouldKeepExisting(_this.destPath, contents))) {
			l.vlog("Skipping unchanged '" + _this.relPath+"'")
			return false;
		}


		l.log("Saving "+(template?"(templated) ":"") +"'" + _this.relPath+"' as '"+_this.destRelPath+"'...")
		yield fs.writeFile(_this.destPath, contents);
		l.vlog("Write OK")
		return true;
	})();
};

FileInfo.prototype.isRelInDir = function(relDir) { return fs.isInDir(relDir, this.relPath); }
FileInfo.prototype.isInDir = function(dir) { return fs.isInDir(dir, this.path); }



module.exports = FileInfo;