/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the public api for plugins
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-plugin');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');

//l.color = l._colors.Dim+l._colors.FgRed;

var _renderers = []; // yes. a Global. Live with it. I like using Goto and Jumps too. I like uneven indents and inconsistent strings. I like redunant semi colons; If you have a problem with this, go & look at the node-js scoping to see why this isn't really a global anyway!


function Renderer(name, options) {
	options = options || {};
	if (_.isEmptyString(name)) 
		throw new Error("Name is required when registering a plugin");
	if (_.isEmptyString(options.extensions)) 
		throw new Error("Extensions are required for plugin " + name);
	if (!_.isFunction(options.renderFn))
		throw new Error("RenderFn is required for plugin " + name)
	this.name = name;
	this.preRender = []; // an array of { name, priority }
	this.postRender = []; // an array of { name, priority }


	// re-applies the configuration for this renderer.
	// This gives websites the ability to completely change default actions
	this.options = _.extend( {
		  priority: 50
		, binary: false
		// , calcExtensionFn: function(origFilename) { return _plugin.DEF_EXTENSION; }
		// , extensions: []
		// , renderFn
		// , reconfigureFn:
		// , saveFn
		}, options);

	this.extensions = _.toRealArray(this.options.extensions, ",").map(_normaliseExt);
	//this.render = this.options.renderFn;
}

Renderer.prototype.constructor = Renderer;

function __addToRenderList(list, name, priority) {
	var pre = {
		name: name
		, priority: priority || 50
	}
	list.push(pre);
	list.sort(function(a,b) { return a.priority - b.priority; });
}
Renderer.prototype.addPreRenderer = function(name, priority) {
	if (!_findRendererByName(name))
		// maybe it hasn't been registered yet?
		l.logw(this.name + ".addPreRenderer(). '" + name + "' not found in list of renderers... yet");
	__addToRenderList(this.preRender, name, priority);
	return this; // for chaining
};
Renderer.prototype.addPostRenderer = function(name, priority) {
	if (!_findRendererByName(name))
		// maybe it hasn't been registered yet?
		l.logw(this.name + ".addPostRenderer(). '" + name + "' not found in list of renderers... yet");
	__addToRenderList(this.postRender, name, priority);
	return this; // for chaining
};

Renderer.prototype.calcExtension = function(filename, currentExt) {
	if (this.options.calcExtensionFn)
		return this.options.calcExtensionFn.call(this, filename, currentExt);
	return _plugin.DEF_EXTENSION; // by default, just return 'html'
}

Renderer.prototype.reconfigure = function(plugin_options) {
	// this func is called just after it's file has been 'require' -ed. in _loadPlugin
	l.vvlog("Renderer settings for '"+this.name+"' set to: " + l.dump(plugin_options));
	plugin_options = plugin_options || {};
	if (this.options.reconfigureFn)
		this.options.reconfigureFn.call(this, plugin_options);

	return this; // for chaining
};

function __renderList(list, used, text) {
	list.forEach(function(pre) {
		var renderer = pre.renderer || _findRendererByName(pre.name);
		if (!renderer)
			throw new Error("Failed to ever find the renderer named '"+pre.name+"'");
		if (!pre.renderer) //save it for later
			pre.renderer = renderer;
		if (used.indexOf(renderer)<0) {
			text = renderer.render(text);
			used.push(renderer); // only do this rendering once
		}
	});
	return text;
}

Renderer.prototype.render = function(text, fileInfo, context) {
	var used = [this];
	if (this.preRender.length) {
		l.vvlogd('Prerendering ' + this.name)
		text = __renderList(this.preRender, used, text, fileInfo, context);
	}
	l.vvlogd('Rendering ' + this.name)
	text = this.options.renderFn.call(this, this.options.binary ? text : text.toString(), fileInfo, context);
	if (this.postRender.length) {
		l.vvlogd('Postrendering ' + this.name)
		text = __renderList(this.postRender, used, text, fileInfo, context);
	}
	return text;
};

Renderer.prototype.save = function(context) {
	if (this.options.saveFn)
		return Promise.resolve(this.options.saveFn.call(this, context));
	return Promise.resolve(true);
};

function _normaliseExt(ext) {
	if (ext && ext.length && ext[0]=='.') 
		return ext.substr(1);
	return ext;
}

function _findRendererByNameIndex(name) {
	return _renderers.findIndex(function(r) { return r.name==name; });
}
function _findRendererByName(name) {
	return _renderers.find(function(r) { return r.name==name; }) || null;
}

function _findRendererByExt(ext) {
	ext = _normaliseExt(ext);
	// NB: since we've already sorted the plugins by priority then we only need find the first plugin
	return _renderers.find(function(r) {
		return r.extensions.indexOf(ext)>-1;
	}) || null; // return null, rather than undefined 
}

function _getExtensions(filename) {
	// given a filename, splits into components, by 'dots'
	// this can given false positives,eg. i.like.to.use.dots.in.myfilename.html
	var sections = path.basename(filename).split('.'); // strip off any path info & seperate
	return sections.slice(1); // the first one is the base filename, so ignore it, the rest are ext's
}

function _buildRenderChain(filename, configObj) {
	// various scenarios:
	// blogpost.tex:    
	//		simple => textile => (save)
	// 			or, if moustache & html renderers added:
	//		moustache => textile => minify => (save)
	// somecss.less:
	//		=> (save)
	//			or, if less & minifier installed :
	//		less => cssminify => (save)
	// someimage.jpg:   <===== WE DON'T DO IMAGES ATM. WE ASSUME IT'S TEXT
	//		=> (save)
	//			or, if some watermarking thing present
	//		watermark => (save)
	// somefile.tem.xyz
	//		simepltags => xyz filter => (save)

	// So, we build a list starting from the 'left-most' extension
	filename = path.basename(filename); // we're not interested in retaining folder structure of the original filename
	l.vlogd("building render chain for '" + filename+ "'");
	var basefilename = filename.substr(0, filename.indexOf('.'))
	var exts = _getExtensions(filename);
	// l.vvlogd("Extensions are: " + exts)
	var chain = [];

	// NB: 
	// 		markdown & textile renderers BOTH use "simple" as a preRenderer, 
	//			so "simple" is implicitly included here, when .tex is used.
	var nextExt = exts.slice(-1) || _plugin.DEF_EXTENSION;
	for (var e=0; e<exts.length; e++) {
		// find the best renderer for this extension
		var ext = exts[e];
		var r = _findRendererByExt(ext);
		if (!r) {
			l.vvlogd("Failed to find renderer for '"+ext+"' in '"+filename+"'. Skipping...")
			continue;
		}
		if (chain.indexOf(r)<0) {
			l.vvlogd("Chaining renderer '"+ext+"' in '"+filename+"'")
			chain.push(r);
		}
		nextExt = r.calcExtension(filename, ext); // basefilename+'.'+(exts.slice(0,e+1)).join('.'))
		l.vvlogd("calcExtension("+filename+","+ext+") ==> '"+nextExt+"'")
		var nextAt  = exts.findIndex(function(ex) { return ex==nextExt;});
		if (nextAt<0 && !!_findRendererByExt(nextExt)) { // then, we should add this extension now... we'll need it
			// this allows "blogpost.tex" to then become "blogpost.tex.html" and allow a minifier
			l.vlogd("Added missing link '"+nextExt+"'' to '" + filename + "'")
			exts.push(nextExt);
		}
	}

	return { renderers:chain, filename: basefilename+'.'+nextExt };
}

function _reconfigurePlugin(renderer, context) {
	if (!!renderer && 
			_.isDefined(context.config['plugin_options']) && 
			_.isDefined(context.config.plugin_options[renderer.name])) 
	{
		renderer.reconfigure(context.config.plugin_options[renderer.name]);
	}
	return renderer;
}
function _loadplugin(name, context) {
	var userPath = context.getPluginsPath();
	var renderer = _findRendererByName(name);
	if (!!renderer) {
		// unsure if an error shouldn't be raised if already loaded!
		//l.logw("Unexpected. The plugin ("+name+") has already been loaded. The existing plugin will be used")
		//_reconfigurePlugin(renderer, context); // We definitely SHOULDN'T reconfigure.... probably! ;)

		// Other problems:
		// user might specify in config:
		// plugins: "default,textile", which will load the textile plugin again!
		return renderer; // already loaded & configured.
	}

	if (fs.dirExistsSync(userPath)) {
		var userLib = path.join(userPath, name);
		try {
			require(userLib)
		}
		catch (e) {
			// we expect to fail to load plugins... but generate a *real* error if there is a file in there
			if (fs.fileExistsSync(userLib)) {
				l.loge("Error loading plugin '" + name+ "' in '"+userPath+"':\n"+_.niceStackTrace(e))
				return null;
			}
		}

		// try & load our plugin
		renderer = _findRendererByName(name);
	}

	if (!renderer) {
		// else fall thru to trying to load it from our in-built plugins. 
		var inbuiltLib = path.join('../lib/plugins', name);
		try {
			require(inbuiltLib)
		}
		catch (e) {
			// we expect to fail to load plugins... but generate a *real* error if there is a file in there
			if (!fs.fileExistsSync(userLib)) 
				l.loge("Cannot find plugin '" + name+ "' in '"+userPath+"' or from internal libraries")
			else
				l.loge("Error loading plugin '"+name+"' from internal library:\n" + _.niceStackTrace(e))
		}
		renderer = _findRendererByName(name);
	}

	_reconfigurePlugin(renderer, context);
	return renderer;

}

function _saveAllPlugins(context) {
	return Promise.coroutine( function *() {
		for (var i=0; i<_renderers.length; i++) {
			yield _renderers[i].save(context);
		}
	})();
}

var _plugin = {
	// some common names
	  DEF_EXTENSION: "html"
	, RENDERER_TAG: "tag" // simple tag renderer. If using moustache, use this as the name to inject cleanly
    , RENDERER_TEXTILE: "textile" // only here, because it's inbuilt & someone might have a different library to swap in
    , RENDERER_MARKDOWN: "marked" // only here, because it's inbuilt & someone might have a different library to swap in

	//
	, addRenderer: function(name, options) {
		if (_findRendererByName(name))
			throw new Error("Plugin already defined for " + name);
		var newRenderer = new Renderer(name, options);
		_renderers.push(newRenderer);

		l.logd("Added renderer: " + name)
		l.vvlogd("renderer "+name+" is: " + l.dump(newRenderer))

		// makes find/searching consistent if sorted by priorty now
		// NB: If someone goes & changes priority AFTER being created then this barfs.
		//     We assume ppl will call resort() if needed. (eg AFTER a reconfigure)
		_plugin.resort(); // which actually resorts the renderers.

		return newRenderer;
	  }
	, removeRenderer: function(name) {
 		var i = _findRendererByNameIndex(name);
 		if (i<0) return null;
 		var prevRenderer = _renderers[i];
 		_renderers.splice(i,1)
 		return prevRenderer;
	  }
	, getRenderer: function(name) {
		return _findRendererByName(name);
	  }
	, getRenderers: function() { 
		return _renderers.slice(); // return a *copy* 
	 }
	, resort: function() {
		_renderers.sort(function(a,b) { return a.__priority - b.__priority; }); 
	}
	, buildRenderChain: _buildRenderChain
	, loadPlugin: _loadplugin
	, saveAll: _saveAllPlugins
};

module.exports = _plugin;