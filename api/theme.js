
/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'theme'
*/
"use strict";

var l  = require('ergo-utils').log;//.module('ergo-api-theme');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var download = require("download-git-repo")

// promisify a few funcs we need
"dirExists,fileExists,ensureDir,emptyDir,readFile,writeFile,readdir,remove".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

download = Promise.promisify(download);


function _sed(file, search, replace, options) {
return Promise.coroutine(function *() {
	var retVal = false;
	var data = (yield fs.readFile(file, 'utf8')).toString();
	data = data.replace(search, function() { 
		retVal = true;
		return replace; });
	yield fs.writeFile(file, data, 'utf8')
	return retVal;
})();
}

function _theme_switch(name, options) {
return Promise.coroutine(function *() {
	options = options || {};
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var foldername = name; // strip out any ergo-cms/theme ish things
	var dest = path.join(context.getThemesRootPath(), foldername);

	if (!(yield fs.dirExists(dest))) {
		l.loge("'"+foldername+"' is not installed. Please run 'ergo theme install "+foldername+"'");
		return false;
	}

	if (!(yield _sed(context.config_path, /\btheme\s*\:\s*["'].*?['"]/i, "theme: \""+foldername+"\""))) { // look for 'theme : "..."'
		// couldn't find the theme entry
		if (!(yield _sed(context.config_path, /\bmodule\.exports\s*\=\s*\{/i, "module.exports = {\n\ttheme: \""+foldername+"\","))) { // look for 'module.exports = {' 
			l.logw("Failed to update'"+context.config_path+"'. You will need to add 'theme: \""+foldername+"\",' manually");
			return false;
		}
		else
			l.vlog("Added new theme entry");
	}
	else
		l.vlog("Updated theme entry");
	return true;
})();}

function _theme_install(name, options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var foldername = path.basename(name).replace(/[-_]?theme[-_]?/i, ''); // strip out any ergo-cms/theme ish things
	var repo = name;
	if (repo.indexOf('/')<0)
		repo = 'github:ergo-cms/theme-'+repo;
	var dest = path.join(context.getThemesRootPath(), foldername);
	l.vlog("installing '"+repo+"' as '"+foldername+"'")
	if (options.progress)
		options.progress('install')
	yield download(repo, dest, {});
	if (!(yield fs.fileExists(path.join(dest,"theme.ergo.js")))) {
		l.loge("'"+repo+"' is not a valid theme file. It is missing 'theme.ergo.js'. Operation aborted")
		return null;
	}

	yield _theme_switch(foldername, { context:context})
	return foldername;
})();
}

function _theme_list(options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var files = yield fs.readdir(context.getThemesRootPath());
	for(var i=0; i<files.length; i++) {
		var dir = path.join(context.getThemesRootPath(), files[i]);
		if ((yield fs.dirExists(dir)) && (yield fs.fileExists(path.join(dir, 'theme.ergo.js'))))
			console.log(files[i]);
	}
	console.log(""); // deliberate empty line

	return true;
})();
}

function _theme_remove(name, options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var foldername = name; // strip out any ergo-cms/theme ish things
	if (foldername == context.config.theme) {
		l.loge("Cannot remove the active theme. Change the active theme with 'ergo theme switch [other-theme]'")
		return false;
	}
	var dir = path.join(context.getThemesRootPath(), foldername);
	if (yield fs.dirExists(dir))
		yield fs.remove(dir)
	else
		l.logw("Theme '"+foldername+"' not found.")
})();
}


module.exports = {
	install: _theme_install,
	switch: _theme_switch,
	list: _theme_list,
	remove: _theme_remove,
}