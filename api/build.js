/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the api file for 'config' related helpers.
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-build');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var plugin = require('./plugin')
// promisify a few funcs we need
"dirExists,ensureDir,readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

l.debug = 3;
l.verbose = 2;
/*
Options can be:

{
	step3: profit
}

*/
var _textile = require('textile-js');
var _marked = require('marked');


plugin.addRenderer(plugin.RENDERER_TEXTILE, { 
	  extensions: "tex,textile"
	, renderFn: function(text) { return _textile(text) }
	//, reconfigureFn: function(render_options) { this.textile_options = render_options; }
}).addPreRenderer(plugin.RENDERER_TAG)
//_textile.setConfig({})

plugin.addRenderer(plugin.RENDERER_MARKDOWN, { 
	  extensions: "md,markdown"
	, renderFn: function(text) { return _marked(text) }
	//, reconfigureFn: function(render_options) { this.md_options = render_options; }
}).addPreRenderer(plugin.RENDERER_TAG)
//_marked.setConfig({});

plugin.addRenderer(plugin.RENDERER_TAG, { 
	  extensions: "tem"
	, renderFn: function(text) { return text; }
	//, reconfigureFn: function(render_options) { this.textile_options = render_options; }
	, calcExtensionFn: function(filename) {
		// simply return the rightmost extension
		return filename.split('.').slice(-1)
	}
})



module.exports = function(options) {
return Promise.coroutine(function *() {
	options = options || {};
	var config = require('./config').getConfigSync(options.working_dir, options);

	l.vvlog(l.dump(config));

	if (!(yield fs.dirExists(config.getSourcePath())))
		throw new Error("Missing source path: "+config.getSourcePath());

	// (We'll deal with missing layouts/partials as they arise, since they may not actually be needed)
	yield fs.ensureDir(config.getOutPath());

	var _buildFile = function(item) {
		return Promise.coroutine(function *() {
			// this is where most of the action occurs.
			l.vvlog(item.path+ "...")
			var chain = plugin.buildRenderChain(item.path, config); // TODO. Make options specific for the renderer?
			var renderers = chain.renderers;
			//l.vlogd(l.dump(renderers));
			var text = yield fs.readFile(item.path);
			l.vvlogd("Read OK " + item.path)
			renderers.forEach(function(r) {
				l.vvlog("Rendering with '" + r.name + "' " + item.path)
				text = r.render(text);
			})

			var pathofs = path.relative(config.getSourcePath(), path.dirname(item.path));
			var destdir = path.join(config.getOutPath(), pathofs);
			var destfile = path.join(destdir, chain.filename);
			l.vvlog("Ensuring '"+destdir+"'...")
			yield fs.ensureDir(destdir);
			l.vvlog("Writing to '"+destfile+"'...")
			yield fs.writeFile(destfile, text);
			l.vvlogd("Write OK")
			return true;
		})();
	}


	var _walk = function(dir, fn) {
		return Promise.coroutine(function *() {
			var p = Promise.resolve();
			var walkerP = new Promise(function(resolve) { // I'd love to know how to not use the promise anti-pattern here!

				function resolvall() {
					p.then(function() {
						resolve(true)
					});
				}
				fs.walk(dir)
				.on('data', function (item) {
					var stats = item.stats; // don't follow symlinks!
					if (stats.isFile()) {
						p = p.then(function() { 
							l.vvlogd("> " +item.path)
							return fn(item); 
						})
					}
					else
						l.vlogd("skipping " + item.path)
				})
				.on('end', function () {
					resolvall();
				})
				.on('error', function(e) {
					l.vlogw(_.niceStackTrace(e))
					resolvall();
				})
				return true;
			});
			yield walkerP;
		})();
	};
	
	yield _walk(config.getSourcePath(), _buildFile);

	return true;
})();
}