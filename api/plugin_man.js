
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


var _sed = require('../lib/sed').sedP;

function _plugin_install(name, options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var foldername = path.basename(name).replace(/[-_]?plugin[-_]?/i, ''); // strip out any ergo-cms/plugin ish things
	var repo = name;
	if (repo.indexOf('/')<0)
		repo = 'github:ergo-cms/plugin-'+repo;
	var dest = path.join(context.getPluginsPath(), foldername);
	l.vlog("installing '"+repo+"' as '"+foldername+"'")
	if (options.progress)
		options.progress('install')
	yield download(repo, dest, {});
	if (!(yield fs.fileExists(path.join(dest,"plugin.ergo.js")))) {
		l.loge("'"+repo+"' is not a valid plugin file. It is missing 'plugin.ergo.js'")
		return null;
	}

	return foldername;
})();
}

function _plugin_list(options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var files = yield fs.readdir(context.getPluginsPath());
	for(var i=0; i<files.length; i++) {
		var dir = path.join(context.getPluginsPath(), files[i]);
		if ((yield fs.dirExists(dir)) && (yield fs.fileExists(path.join(dir, 'plugin.ergo.js'))))
			console.log(files[i]);
	}

	return true;
})();
}

function _plugin_remove(name, options) {
return Promise.coroutine(function *() {
	options = options || {}
	var context = options.context || (yield require('./config').getContextP(options.working_dir));
	var foldername = name;
	var dir = path.join(context.getPluginsPath(), foldername);
	if (yield fs.dirExists(dir))
		yield fs.remove(dir)
	else
		l.logw("Plugin '"+foldername+"' not found.")
})();
}


module.exports = {
	install: _plugin_install,
	list: _plugin_list,
	remove: _plugin_remove,
}