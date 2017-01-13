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

// Yes, globals. Live with it. I like using Goto and Jumps too. I like uneven indents and inconsistent strings. 
// I like redundant semi colons; 
var _renderers = []; 

function Renderer(name, options) {
	options = options || {};
	if (_.isEmptyString(name)) 
		throw new Error("A 'name' parameter is required when registering a plugin");
	if (!_.isFunction(options.renderFn))
		throw new Error("'renderFn' callback is required for plugin " + name)
	this.name = name;
	this.preRender = []; // an array of { name, priority }
	this.postRender = []; // an array of { name, priority }


	// re-applies the configuration for this renderer.
	// This gives websites the ability to completely change default actions
	this.options = _.extend( {
		  priority: 50
		, binary: false
		// , calcExtensionFn: function(origFilename) { return _api.DEF_EXTENSION; }
		// , extensions: []
		// , renderFn
		// , reconfigureFn:
		// , saveFn
		}, options);
	this.plugin_options = {}; // specfic options for the renderer. Set by 'plugin_options' in config.js

	this.extensions = _.toRealArray(this.options.extensions || "", ",").map(_normaliseExt);
	//this.render = this.options.renderFn;
}

Renderer.prototype.constructor = Renderer;

function __addToRenderList(list, name, priority) {
	var pre = {
		name: name
		, priority: priority || 50
	}
	list.push(pre);
	list.sort(function(a,b) { return b.priority - a.priority; });
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
	return _api.DEF_EXTENSION; // by default, just return 'html'
}

Renderer.prototype.reconfigure = function(plugin_options) {
	// this func is called just after it's file has been 'require' -ed. in _loadPlugin
	l.vvlog("Renderer settings for '"+this.name+"' set to: " + l.dump(plugin_options));
	this.plugin_options = plugin_options || {};
	if (this.options.reconfigureFn)
		this.options.reconfigureFn.call(this, plugin_options);

	return this; // for chaining
};

Renderer.prototype.render = function(fields, fileInfo, context) {
	if (this.name!='dummy') l.vvlogd('Rendering ' + this.name)
	fields.content = this.options.binary ? fields.content : fields.content.toString();
	return this.options.renderFn.call(this, fields.content, fields, fileInfo, context);
}


Renderer.prototype.save = function(context) {
	if (this.options.saveFn)
		return Promise.resolve(this.options.saveFn.call(this, context));
	return Promise.resolve(true);
};










function _normaliseExt(ext) { // we don't use '.' in our extension info... but some might leak in here and there
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

function _addRenderer(name, options) {
	if (_findRendererByName(name))
		throw new Error("Plugin already defined for " + name);
	var newRenderer = new Renderer(name, options);
	_renderers.push(newRenderer);

	l.logd("Added renderer: " + name)
	l.vvlogd("renderer "+name+" is: " + l.dump(newRenderer))

	// makes find/searching consistent if sorted by priorty now
	// NB: If someone goes & changes priority AFTER being created then this barfs.
	//     We assume ppl will call resort() if needed. (eg AFTER a reconfigure)
	_api.resort(); // which actually resorts the renderers.

	return newRenderer;
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
	var nextExt = exts.slice(-1) || _api.DEF_EXTENSION;
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


	var ordered = [];
	// Now we have the main 'renderers' required, we walk the complete render tree and generate an in-order list
	function _walk(r) {
		function _fetchAndWalk(obj) { // obj is { name, priority }
			var renderer = obj.renderer || _findRendererByName(obj.name);
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
	chain.forEach(_walk);

	var finalFilename = filename;
	if (ordered.length>0) // only futz with the 'extensions' if we have a valid render chain...? Even then, this might NOT be a good idea!
		finalFilename = basefilename+'.'+nextExt;
	l.vvlog("Render chain for '" + filename+ "' is: " + l.dump(ordered.map(function(r) { return r.name; })));
	return { renderers:ordered, filename: finalFilename };
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

function _loadDefaultPlugins(context) {
	var default_plugins = [ // the order of these is not important... but if they're not in this order, a few warnings will appear
		      _api.RENDERER_ADD_DATA
		    , _api.RENDERER_HEADER_READ
			,  _api.RENDERER_TAG
		    , _api.RENDERER_TEMPLATE_MAN
		    , _api.RENDERER_TEXTILE
		    , _api.RENDERER_MARKDOWN
			];
	l.vlog("Loading default plugins...");
	var p = [];
	default_plugins.forEach(function(def_name) {				
		p.push(_api.loadPlugin(def_name, context));
	});
	return p;
}


function _loadplugin(name, context) {
	if (!dummy_renderer) {
		// add the dummy renderer on the first plugin load
		dummy_renderer = _api.addRenderer("dummy", { priority:100, renderFn: function(text) { return text; } } );		
	}
	if (name=="{default}" || name=="default")
		return _loadDefaultPlugins(context);

	l.vlog("Loading plugin '"+name+"'");
	var userPath = context.getPluginsPath();
	var renderer = _findRendererByName(name);
	if (!!renderer) {
		// unsure if an error shouldn't be raised if already loaded!
		//l.logw("Unexpected. The plugin ("+name+") has already been loaded. The existing plugin will be used")
		//_reconfigurePlugin(renderer, context); // We definitely SHOULDN'T reconfigure.... probably! ;)

		// Other problems:
		// user might specify in config:
		// plugins: "default,textile", which will load the textile plugin again!
		l.vlogw("Plugin '"+name+"' has already been loaded")
		return renderer; // already loaded & configured.
	}

	if (fs.dirExistsSync(userPath)) {
		var userLib = path.join(userPath, name);
		try {
			require(userLib)
		}
		catch (e) {
			// we expect to fail to load plugins... but generate a *real* error if there is a file in there
			if (fs.fileExistsSync(userLib+'.js')) {
				l.loge("Error loading plugin '" + name+ "' in '"+userPath+"':\n"+_.niceStackTrace(e))
				return null;
			}
		}

		// try & load our plugin
		renderer = _findRendererByName(name);
	}

	if (!renderer) {
		// else fall thru to trying to load it from our in-built plugins. 
		var inbuiltLib = path.join(path.dirname(__dirname), 'lib','plugins', name);
		try {
			require(inbuiltLib)
		}
		catch (e) {
			// we expect to fail to load plugins... but generate a *real* error if there is a file in there
			if (!fs.fileExistsSync(inbuiltLib+'.js')) 
				l.loge("Cannot find plugin '" + name+ "' in '"+userPath+"' or from internal library")
			else
				l.loge("Error loading plugin '"+name+"' from internal library:\n" + _.niceStackTrace(e))
			throw e;
		}
		renderer = _findRendererByName(name);
	}

	_reconfigurePlugin(renderer, context);
	return renderer;

}


/*
### Race Conditions

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

var dummy_renderer = null;

function _rightAlignRenderers(context) {
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


function _saveAll(context) {
	return Promise.coroutine( function *() {
		for (var i=0; i<context.files.length; i++)
		{
			var fi = context.files[i];
			yield fi.save(context); 
		}

		for (var i=0; i<_renderers.length; i++) {
			yield _renderers[i].save(context);
		}
		return true;
	})();
}

function _renderAll(context) {
	return Promise.coroutine( function *() {
		_rightAlignRenderers(context);

		var keep_rendering = true;
		l.vlog("Rendering...")
		while(keep_rendering) {
			keep_rendering = false;
			for (var i=0; i<context.files.length; i++)
			{
				var fi = context.files[i];
				if (fi.renderNext(context))
					keep_rendering = true;
			}
		}
		l.vlog("Saving...")
		yield _saveAll(context);
		return true;
	})();
}	


var _api = {
	// some common names
	  DEF_EXTENSION: "html" // This CAN be changed by configuration at run-time, through the config.default_extension property.

	// These render names only here, because it's inbuilt & someone might have a different library to swap in
	, RENDERER_TAG: "simpletag" 
    , RENDERER_TEMPLATE_MAN: "template_man" 
    , RENDERER_HEADER_READ:  "header_read" 
    , RENDERER_ADD_DATA:  "add_data" 
    , RENDERER_TEXTILE: "textile"
    , RENDERER_MARKDOWN: "marked"

	//
	, addRenderer: _addRenderer
	, removeRenderer: function(name) {
 		var i = _findRendererByNameIndex(name);
 		if (i<0) return null;
 		var prevRenderer = _renderers[i];
 		_renderers.splice(i,1)
 		return prevRenderer;
	  }
	//, getRenderer: function(name) {
	//	return _findRendererByName(name);
	//  }
	//, getRenderers: function() { 
	//	return _renderers.slice(); // return a *copy* 
	//}
	, resort: function() {
		_renderers.sort(function(a,b) { return b.priority - a.priority; }); 
	}
	, changeDefaultExtension: function(defExt) {
    	var defExt = _normaliseExt(defExt);
		l.vlog("Changing default Extension: " + defExt)
    	if (!_.isEmptyString(defExt) && defExt!=_api.DEF_EXTENSION) {
    		l.vlog("Changed default extension to '" +defExt+ "'")
    		_api.DEF_EXTENSION = defExt;
    		if (_renderers.length) {
				l.logw("Changed default extension after plugins have loaded. Expect the unexpected");
				return -1;
    		}
    		return true;
    	}
    	return false;

	  }
	, buildRenderChain: _buildRenderChain
	, loadPlugin: _loadplugin

	, renderAll: _renderAll
};


module.exports = _api;

