/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'build'
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-build');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
// promisify a few funcs we need
"dirExists,ensureDir,emptyDir,emptyDir,readFile,writeFile,readlink,realpath".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

//function _walk(dir, fn, options)
var _walk = require('../lib/walk')

var plugin_api = require('./plugin')
var context = require('../lib/context');
var FileInfo = require('../lib/fileinfo');



/*
function _getDirLastWriteTime(dir)
{
return Promise.coroutine(function *() {
	if (!(yield fs.dirExists(dir)))
		return new Date(1970,1,1);

	var dlatest = 0;
	yield _walk(dir, null, function(item) {
		if (item.stats.mtime>dlatest)
			dlatest = item.stats.mtime;
	}) 
	return dlatest;
})();
}
*/


/*
### Race Conditions for data availability

There are possible race conditions. eg:

* blog.tem.html, followed by
* blog/blog post.md

The render chain for both is:

* template_man, simpletag
* header_read, header_add, marked, template_man, simpletag

However, if we render each in order, then `blog.tem.html` will try to render before `header_add` has been reached in the other. 
There are 2 solutions to this:

1. 'right align' all rendering, padding with a 'dummy_render', such that the render chains are:
 * dummy       , dummy       , dummy       , template_man, simpletag
 * header_read , header_add  , marked      , template_man, simpletag
        (Which just happens to work, in this case)
2. A more tricky 'alignment' such that all eg 'template_man', will be rendered at the same time

Option 1. has been chosen, for now...aka _rightAlignRenderers():
*/	
function _rightAlignRenderers(context) {
	var dummy_renderer = plugin_api.findRendererByName(context, "dummy");

	// find the length of the longest chain.
	var longest = 0;
	for (var i=0; i<context.files.length; i++)
	{
		var fi = context.files[i];
		longest = Math.max(longest, fi.renderers.length);
	}
	// inject the dummy renderer to the left of the existing renderers
	for (var i=0; i<context.files.length; i++)
	{
		var fi = context.files[i];
		if (fi.renderers.length<longest)
			fi.renderers = (new Array(longest - fi.renderers.length)).fill(dummy_renderer).concat(fi.renderers);
	}
}


function _loadAll(context) {
	return Promise.coroutine( function *() {
		var startTime = Date.now();
		for (var i=0; i<context.files.length; i++)
		{
			var fi = context.files[i];
			yield fi.loadOrCopy(context); 
		}
		yield plugin_api.loadAll(context)
		l.elapsed(startTime, 'loadAll ')
		return true;
	})();
}

function _saveAll(context) {
	return Promise.coroutine( function *() {
		var startTime = Date.now();
		for (var i=0; i<context.files.length; i++)
		{
			var fi = context.files[i];
			yield fi.save(context); 
		}

		yield plugin_api.saveAll(context)
		l.elapsed(startTime, 'saveAll ')
		return true;
	})();
}

function _renderAll(context) {
	return Promise.coroutine( function *() {
		l.vlog("Loading...")
		yield _loadAll(context)

		_rightAlignRenderers(context);

		var keep_rendering = true;
		l.vlog("Rendering...")
		l.pushTime();
		var pass=1;
		while(keep_rendering) {
			keep_rendering = false;
			//l.pushTime();
			for (var i=0; i<context.files.length; i++)
			{
				var fi = context.files[i];
				if (fi.renderNext(context))
					keep_rendering = true;
			}
			//l.popTime("Render pass #"+(pass++)+' ' )
		}
		l.popTime('Total Render ')

		l.vlog("Saving...")
		yield _saveAll(context);
		return true;
	})();
}	




module.exports = function(options) {
return Promise.coroutine(function *() {
	l.pushTime();
	l.log("Building...")
	options = options || {};
	var context = require('./config').getContextSync(options.working_dir);
	context.mergeRuntimeOptions(options);

	// find plugins & prep them
	var plugin_filenames = [];
	l.vlog("Reading plugins...")
	yield _walk(context.getPluginsPath(), function(item) {
		if (path.basename(item.path)==='plugin.ergo.js') 
			plugin_filenames.push(item.path);
	}, { followSymLinks:true });
	yield plugin_api.init(context, plugin_filenames);

	l.vvlogd("Context is:\n"+l.dump(context));

	if (!(yield fs.dirExists(context.getSourcePath())))
		throw new Error("Missing source path: "+context.getSourcePath());

	// (We'll deal with missing layouts/partials as they arise, since they may not actually be needed)
	yield fs.ensureDir(context.getOutPath());

	var rebuild = options.clean;
	/* This has no real effect. A file will only write if it actually changes anyhow.
	var _lastBuildTime = yield _getDirLastWriteTime(context.getOutPath());
	if (!rebuild && (yield _getDirLastWriteTime(context.getPartialsPath()))>_lastBuildTime) {
		l.log("Partials directory has changed. Rebuilding...")
		rebuild = true;
	}
	if (!rebuild && (yield _getDirLastWriteTime(context.getLayoutsPath()))>_lastBuildTime) {
		l.log("Layouts directory has changed. Rebuilding...")
		rebuild = true;
	}*/

	if (rebuild) {
		//yield fs.emptyDir(context.getOutPath()); Removed. We know obey .ergoignore

		//var _destIgnoreFn = yield _get_fileFilter(context.getOutPath());
		var _deleteFile = function(item) {
			l.vlog("Removing '"+item.path+"'...");
			fs.remove(item.path);
		}
		l.log("Cleaning '"+context.getOutPath()+"'...")
		yield _walk(context.getOutPath(), _deleteFile, {walkDirs:true} );
	}

	var _addFile = function(item) {
		if (!fs.isInDir(context.getOutPath(), item.path)) // don't allow anything in the output folder to be added.
			return context.addFile(item.path, item.stats);
		return false;
	}

	
	l.log("Reading '"+context.getSourcePath()+"'...")

	if (fs.isInDir(context.getSourcePath(), context.getPartialsPath()))
		l.logw("Partials folder is inside the source folder. This can be problematic")
	else
		yield _walk(context.getPartialsPath(), _addFile); // load the partials, if not already done

	if (fs.isInDir(context.getSourcePath(), context.getLayoutsPath()))
		l.logw("Layouts folder is inside the source folder. This can be problematic")
	else
		yield _walk(context.getLayoutsPath(), _addFile); // load the layouts, if not already done

	if (fs.isInDir(context.getSourcePath(), context.getThemePath()))
		l.logw("Theme folder is inside the source folder. This can be problematic")
	else {
		yield _walk(context.getThemePath(), _addFile); // load the themes, if not already done
	}

	yield _walk(context.getSourcePath(), _addFile);


	// Now that all the files are ready, we can do something about loading/rendering/saving them
	yield _renderAll(context);

	//l.log("Done");
	l.popTime("Done. Total")
	return true;
})();
}