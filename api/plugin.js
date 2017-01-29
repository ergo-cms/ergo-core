/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the semi-private api for plugins. 
* NB: Many functions are heavily Promisified/Promise tolerant
*/

"use strict";

var l  = require('ergo-utils').log.module('ergo-api-plugin');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
var _config = require('./config')

//l.color = l._colors.Dim+l._colors.FgRed;



function _normaliseExt(ext) { // we don't use '.' in our extension info... but some might leak in here and there
	ext = (ext||'').trim();
	if (ext.length && ext[0]=='.') 
		return ext.substr(1);
	return ext;
}



function _getExtensions(filename) {
	// given a filename, splits into components, by 'dots'
	// this can given false positives,eg. i.like.to.use.dots.in.myfilename.html
	var sections = path.basename(filename).split('.'); // strip off any path info & seperate
	return sections.slice(1); // the first one is the base filename, so ignore it, the rest are ext's
}




/**
* BasePlugin class
*
* Is little more than an association of a node.js module with a 'name'
* It is always listed as part of a BasePlugins array. (See below)
*
* The sequence of events are:
*    1. Load the module, using require(...)
*    2. Once ALL modules are ready, call init() on each plugin
*	 3. call load() on each plugin
*    4. at the end provide opportunuity to save() on each plugin
*/
function BasePlugin(name, module) {
	if (_.isEmptyString(name)) 
		throw new Error("A 'name' parameter is required when registering a plugin");
	this.name = name;
	this.module = module;
	//this.plugin_options = {}; // specfic options for the renderer. Set by 'plugin_options' in config.js
	this.__prepare();
}
BasePlugin.prototype.constructor = BasePlugin;
BasePlugin.prototype.__prepare = function() { };

BasePlugin.prototype.init = function(context, options) {
	// this func is called just after it's file has been 'require' -ed. in _addPlugin
	this.plugin_options = options || {};
	if (this.module.init)
		Promise.resolve(this.module.init.call(this, context, this.plugin_options) || false);
	return Promise.resolve(true);
};

BasePlugin.prototype.load = function(context) {
	if (this.module.load)
		return Promise.resolve(this.module.load.call(this, context) || false);
	return Promise.resolve(true);
};

BasePlugin.prototype.save = function(context) {
	if (this.module.save)
		return Promise.resolve(this.module.save.call(this, context) || false);
	return Promise.resolve(true);
};


/**
* Plugin is a BasePlugin, with features for adding fields & filters 
*/
function Plugin(name, module) {
	BasePlugin.call(this, name, module);
}
Plugin.prototype = Object.create(BasePlugin.prototype);
Plugin.prototype.constructor = Plugin;


/**
* Renderer is a BasePlugin with extra features:
*	-pre and post renderers. These are configured as part of plugin.init()
*	- Note that renderers and plain plugins are kept in seperate lists
*/
function Renderer(name, module) { // a Renderer is a plugin
	BasePlugin.call(this, name, module);
	this.preRender = []; // an array of { name, priority }
	this.postRender = []; // an array of { name, priority }
}

Renderer.prototype = Object.create(BasePlugin.prototype);
Renderer.prototype.constructor = Renderer;
Renderer.prototype.__prepare = function() {
	this.module.priority = this.module.priority || 50;
	this.module.binary   = this.module.binary   || false;
	this.extensions = _.toRealArray(this.module.extensions || "", ",").map(_normaliseExt);
};

function __addToRenderList(list, name, priority) {
	var pre = {
		name: name
		, priority: priority || 50
	}
	list.push(pre);
	list.sort(function(a,b) { return b.priority - a.priority; });
}
Renderer.prototype.addPreRenderer = function(name, priority) {
	//if (!this.findByName(name))
		// maybe it hasn't been registered yet?
	//	l.logw(this.name + ".addPreRenderer(). '" + name + "' not found in list of renderers... yet");
	__addToRenderList(this.preRender, name, priority);
	return this; // for chaining
};
Renderer.prototype.addPostRenderer = function(name, priority) {
	//if (!this.findByName(name))
		// maybe it hasn't been registered yet?
	//	l.logw(this.name + ".addPostRenderer(). '" + name + "' not found in list of renderers... yet");
	__addToRenderList(this.postRender, name, priority);
	return this; // for chaining
};

Renderer.prototype.calcExtension = function(filename, currentExt) {
	if (this.module.calcExtension)
		return this.module.calcExtension.call(this, filename, currentExt);
	return _config.DEF_EXTENSION; // by default, just return 'html'
}

Renderer.prototype.render = function(fields, fileInfo, context) { // TODO. Promisify. Remove fields & ONLY use fileInfo
	if (this.name!='dummy') l.vvlogd('Rendering ' + this.name)
	fields.content = this.module.binary ? fields.content : fields.content.toString();
	return this.module.render.call(this, fields.content, fields, fileInfo, context);
}



/**
* BasePlugins array. 
* 
* A simple array with a list of BasePlugin (or eg Renderer) objects. Each item has:
*	- a 'name' property that can be searched for
*	- a 'priority' that aids in determining importance (100 occurs before 0, 50 is default)
*		(user_plugins ALWAYS take precedence over inbuilt ones of the same name)
*/
function BasePlugins(item_type) {
	if (!item_type) throw new SyntaxError("BasePlugins.ctor called without specifying the item type")
	this.item_type = item_type;
	Array.call(this);
}
BasePlugins.prototype = [];
BasePlugins.prototype.constructor = BasePlugins;
BasePlugins.prototype.findByName = function(name) {
	return this.find(function(p) { return p.name===name; }) || null;
}
BasePlugins.prototype.findByNameIndex = function(name) {
	return this.findIndex(function(p) { return p.name===name; });
};
BasePlugins.prototype.sort = function() {
	Array.prototype.sort.call(this, function(a,b) { return b.priority - a.priority;})
};
BasePlugins.prototype.add = function(name, module, user_plugin) {
	var plugin, orig_name = name;
	if (module.registeras)
		name = module.registeras;

	plugin = this.findByName(name);
	if (plugin) {
		// plugin already exists. 
		if (user_plugin) {
			// replace existing with this one, keeping pre/post renderers intact
			plugin.module = module;

			// NB:NB: This is all trivially useless b/c plugin.init() is ONLY called AFTER all plugins added, 
			//	hence no pre/post renderers are here to be lost anyhow!
			plugin.__prepare(); // calling the ctor again here is bad for a renderer (losing pre/post renderers), so a 'hidden' func used`
		}
		else {
			throw new Error("Unexpected. A non-user plugin was loaded AFTER user-plugins!")
			return null; // return fail.
		}
	}
	else {
		plugin = new (this.item_type)(name, module); // create a Plugin or Renderer object
		this.push(plugin);		
	}

	return plugin;
};

BasePlugins.prototype.init = function(context) { // This is called after all plugins have been created
	var _this = this;
	return Promise.coroutine( function *() {
		if (_.isDefined(context.config['plugin_options']))
		for (var i=0; i<_this.length; i++) {
			var options = context.config.plugin_options[_this[i].name] || {};
			yield _this[i].init(context, options)
		}
		return true;
	})();
};
BasePlugins.prototype.load = function(context) { // this is called just before the first rendering pass
	var _this = this;
	return Promise.coroutine( function *() {
		for (var i=0; i<_this.length; i++) {
			yield _this[i].load(context)
		}
		return true;
	})();
};
BasePlugins.prototype.save = function(context) { // this is called at the end of everything
	var _this = this;
	return Promise.coroutine( function *() {
		for (var i=0; i<_this.length; i++) {
			yield _this[i].save(context)
		}
		return true;
	})();
};

/**
* Plugins
*
* An array of plugin items
*/
function Plugins() {
	BasePlugins.call(this, Plugin);
}

Plugins.prototype = Object.create(BasePlugins.prototype);
Plugins.prototype.constructor = Plugins;


/** 
* Renderers
*
* An array of Renderer plugin items
* Adds renderable functionality.
*/
function Renderers() {
	BasePlugins.call(this, Renderer);
}

Renderers.prototype = Object.create(BasePlugins.prototype);
Renderers.prototype.constructor = Renderers;

Renderers.prototype.findByExt = function(ext) {
	ext = _normaliseExt(ext);
	// NB: since we've already sorted the plugins by priority then we only need find the first plugin
	return this.find(function(r) { 
		return r.extensions.indexOf(ext)>-1;
	}) || null; // return null, rather than undefined 
};












/*
* API functions
*/

function _addPlugin(context, name, module, user_plugin) {
	if (_.isString(module))
		module = require(module)

	var plugin;

	if (module.render && _.isFunction(module.render)) {
		plugin = context._renderers.add(name, module, user_plugin);
	}
	else {
		plugin = context._plugins.add(name, module, user_plugin);
	}
	return plugin;
};


function _initPlugins(context, user_plugins) {
	return Promise.coroutine( function *() {
		context._renderers = new Renderers(); 
		context._plugins = new Plugins();


		var default_plugins = [ // the order of these is not important... but if they're not in this order, a few warnings may appear
			      _api.RENDERER_COLLATE
			    , _api.RENDERER_ADD_DATA
			    , _api.RENDERER_HEADER_READ
				, _api.RENDERER_TAG
			    , _api.RENDERER_TEMPLATE_MAN
			    , _api.RENDERER_TEXTILE
			    , _api.RENDERER_MARKDOWN
				];
		l.vlog("Loading default plugins...");
		default_plugins.forEach(function(def_name) {
			var modulejs = path.join('../lib/plugins',def_name+'.js')
			_addPlugin(context, def_name, modulejs, false);
		});
		// add special dummy renderer
		context._renderers.add("dummy", { priority:100, render: function(text) { return text; } } );

		user_plugins.forEach(function(filename) {
			var name = path.basename(path.dirname(filename)); // eg. _plugins/someplugin/plugin.ergo.js ==> someplugin
			_addPlugin(context, name, filename, true);
		})

		// now apply any user-options, etc
		yield context._renderers.init(context);
		yield context._plugins.init(context);

		context._renderers.sort();
		context._plugins.sort();


		return true;
	})();
}

function _loadAll(context) {
	return Promise.coroutine( function *() {
		yield context._renderers.load(context)
		yield context._plugins.load(context)
	})();
}

function _saveAll(context) {
	return Promise.coroutine( function *() {
		yield context._renderers.save(context)
		yield context._plugins.save(context)
	})();

}



function _makeRenderChain(context, renderers) {

	var ordered = [];
	// Now we have the main 'renderers' required, we walk the complete render tree and generate an in-order list
	function _walk(r) {
		function _fetchAndWalk(obj) { // obj is { name, priority }
			var renderer = obj.renderer || context._renderers.findByName(obj.name);
			if (!renderer)
				throw new Error("Failed to ever find the renderer named '"+obj.name+"'");
			if (!obj.renderer) //save it for later
				obj.renderer = renderer;
			_walk(renderer);
		}
		if (ordered.indexOf(r)<0) { // check that we've already not added this renderer.
			// walk the pre-render list
			r.preRender.forEach(_fetchAndWalk)
			ordered.push(r); // finally push this renderer
			// walk the post-render list
			r.postRender.forEach(_fetchAndWalk)
		}
	}
	renderers.forEach(_walk);	
	return ordered;
}

function _buildRenderChainFromFile(context, filename) {
	// various scenarios:
	// blogpost.tex:    
	//		simple => textile => (save)
	// 			or, if moustache & html renderers added:
	//		moustache => textile => minify => (save)
	// somecss.less:
	//		=> (save)
	//			or, if less & minifier installed :
	//		less => cssminify => (save)
	// someimage.jpg:   <===== These are untested
	//		=> (save)
	//			or, if some watermarking thing present
	//		watermark => (save)
	// somefile.tem.xyz
	//		simepltags => xyz filter => (save)

	// So, we build a list starting from the 'left-most' extension
	filename = path.basename(filename); // we're not interested in retaining folder structure of the original filename
	l.vvlogd("building render chain for '" + filename+ "'");
	var basefilename = filename.substr(0, filename.indexOf('.'))
	var exts = _getExtensions(filename);
	// l.vvlogd("Extensions are: " + exts)
	var chain = [];

	// NB: 
	// 		markdown & textile renderers BOTH use "simple" as a preRenderer, 
	//			so "simple" is implicitly included here, when .tex is used.
	var nextExt = exts.slice(-1) || _config.DEF_EXTENSION;
	for (var e=0; e<exts.length; e++) {
		// find the best renderer for this extension
		var ext = exts[e];
		var r = context._renderers.findByExt(ext);
		if (!r) {
			l.vlogd("Failed to find renderer for '"+ext+"' in '"+filename+"'. Skipping...")
			continue;
		}
		if (chain.indexOf(r)<0) {
			l.vlogd("Chaining renderer '"+ext+"' in '"+filename+"'")
			chain.push(r);
		}
		nextExt = r.calcExtension(filename, ext); // basefilename+'.'+(exts.slice(0,e+1)).join('.'))
		l.vvlogd("calcExtension("+filename+","+ext+") ==> '"+nextExt+"'")
		var nextAt  = exts.findIndex(function(ex) { return ex==nextExt;});
		if (nextAt<0 && !!context._renderers.findByExt(nextExt)) { // then, we should add this extension now... we'll need it
			// this allows "blogpost.tex" to then become "blogpost.tex.html" and allow a minifier
			l.vlogd("Added missing link '"+nextExt+"'' to '" + filename + "'")
			exts.push(nextExt);
		}
	}


	var ordered = _makeRenderChain(context, chain)

	var finalFilename = filename;
	if (ordered.length>0) // only futz with the 'extensions' if we have a valid render chain...? Even then, this might NOT be a good idea!
		finalFilename = basefilename+'.'+nextExt;
	l.vvlog("Render chain for '" + filename+ "' is: " + l.dump(ordered.map(function(r) { return r.name; })));
	return { renderers:ordered, filename: finalFilename };
}

function _buildRenderChainFromRendererNames(context, renderers) {
	var chain = [];
	var renderers = _.toRealArray(renderers, ',');
	for (var i=0; i<renderers.length; i++) {
		var r = context._renderers.findByName(renderers[i]);
		if (!r) {
			l.vvlogd("Failed to find named renderer for '"+renderers[i]+"'. Skipping...")
			continue;
		}
		if (chain.indexOf(r)<0) {
			l.vvlogd("Chaining named renderer '"+renderers[i]+"'")
			chain.push(r);
		}
	}


	var ordered = _makeRenderChain(context, chain)

	l.vvlog("Named render chain is: " + l.dump(ordered.map(function(r) { return r.name; })));
	return { renderers:ordered };
}



function _findRendererByName(context, name) {
	return context._renderers.findByName(name)
}










var _api = {
	// some common names

	// These render names only here, because it's inbuilt & someone might have a different library to swap in
	  RENDERER_TAG: "usematch" 
    , RENDERER_TEMPLATE_MAN: "template_man" 
    , RENDERER_HEADER_READ:  "header_read" 
    , RENDERER_ADD_DATA:  "add_data" 
    , RENDERER_COLLATE:  "collate" 
    , RENDERER_TEXTILE: "textile"
    , RENDERER_MARKDOWN: "marked"
    //, RENDERER_DUMMY: "dummy" // keep undocumented

	, init: _initPlugins
	, saveAll: _saveAll
	, loadAll: _loadAll
	, renderChainFromFile: _buildRenderChainFromFile
	, renderChainFromRendererNames: _buildRenderChainFromRendererNames
	, findRendererByName: _findRendererByName
};


module.exports = _api;

