/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-usematch');
var _  = require('ergo-utils')._;
var path = require('path');

var json_parse = require('../not_json').parse;
var plugin_api = require('../../api/plugin');
const usematch = require('usematch');

//l.color = l._colors.FgGreen;

var renderer = plugin_api.addRenderer(plugin_api.RENDERER_TAG, { // name MUST match the filename
  	  extensions: "tem,tpl"
  	, renderFn: _renderMain
	, calcExtensionFn: _calcExtension
}).addPreRenderer(plugin_api.RENDERER_HEADER_READ);

var default_options = {
	//  tag_start: "{{"
	//, tag_end: "}}"
};

/*
This is an API, compatible with mustache templates, but allows better extensions.
*/


function _calcExtension(filename, currentExt) {
	// simply return the rightmost extension
	var ext = filename.split('.').slice(-1);
	if (ext=='tem' || ext=='html')
		// revert to html if no better option.
		// The html check is here to rename 'tem.html' to '.hubla' if 'hubla' has been set as the new default extension
		return plugin_api.DEF_EXTENSION;
	return ext;
}



function _makeSectionBlocks(context)
{
	if (!!context._makeSectionBlocks_Cache) {
		return context._makeSectionBlocks_Cache;
	}
/*
			context.fields =
			{
			  "post_type": {
			    "article": [
			    	'about.tex'
			    ],
			    "blog": [
			    	'blog/a first post.md'
			    	, 'blog/a second post.tex'
			    ]
			  },
			  "tags": {
			    "freedom": [  // same as above: it's the list of filenames
			    	'about.tex'
			    	, 'blog/a first post.md'
			    ],
			    "about": [
			    	'about.tex'
			    ]
			  }
			}
*/
	function _coerceToType(val, type) {
		var types = {
			date: function(val) { return new Date(Date.parse(val)); },
			int: function(val) { return String.parseInt(val, 10); },
		}
		try {
			if (types[type])
				return types[type](val);
			return val;
		}
		catch (e) {
			return null;
		}
	}

	function __defaultSectionFilter(list, params, default_defaults) {
		default_defaults = default_defaults || ['title', 'asc', 'string']
		if (params.sort !== undefined && params.sort !== false) {
			try {
				if (params.sort === true)
					params.sort = default_defaults[0];
				var ar = params.sort.toString().split(',');
				var whatField = ar[0];
				var order = default_defaults[1];
				var type  = default_defaults[2]; // or int, or date
				if (ar.length>1)
					order = ar[1].toLowerCase();
				if (ar.length>2)
					type = ar[2].toLowerCase();
				var dir = (order=='asc') ? 1: -1;
				list = list.sort(function(a, b) {
					return dir*(_coerceToType(a[whatField]) - _coerceToType(b[whatField]));
				})
			}
			catch(e) {
				// silent fail
			}
		}
		if (params.len !== undefined)
			list = list.slice(0,params.len);
	}

	var blocks = { 

		// having this here allows a user to override ALL posts/prefilters by default
		// in config:
		//		default_fields: {
		//			defaultPostsFilter: function(list, params) { return list; }
		//		}
		// OR, a specific type:
		//		default_fields: {
		//			post.prefilter: function(list, params) { return list; }
		//		}
		//
		defaultPostsFilter: function(list, params) { 
			if (params.sort===undefined) 
				params.sort = true;
			return __defaultSectionFilter(list, params, ['date', 'desc', 'date'])
		}
	};

	// walk the global fields and generate a 'flatter' list of block elements
	// NB: give preference to article_type when name conflicts occur
	for (var key in context.fields) {
		// key is eg. post_type, tags, or category
		var is_post_type = key=='post_type';
		blocks[key] = {}

		for (var posts in context.fields[key]) {
			// posts is eg. 'article', 'blog', or category 'some_category'
			//l.log("context.fields["+key+"]["+posts+"] = " + l.dump(context.fields[key][posts]))
			var items = context.fields[key][posts]
				.map(function(relPath) { 
					return context.getFileInfoByRelPath(relPath).fields; 
				})
				/*.sort(function(a, b) {
					var da = __dateFromFields(a);
					var db = __dateFromFields(b);
					if (da && db)
						return da.valueOf()<db.valueOf() ? 1 : -1; // reverse order
					if (da)
						return -1;
					return 1;
				})*/
				;
			blocks[key][posts] = items;
			blocks[key][posts+".prefilter"] = blocks.defaultPostsFilter;
			//l.log("blocks["+key+"]["+posts+"] = " + l.dump(blocks[key][posts]))

			if (is_post_type) {
				// eg. 'article'==>'articles', or 'blog'==>'blog'
				blocks[posts] = items;
				blocks[posts+'.prefilter'] = blocks.defaultPostsFilter;
			}
		}
	}

	l.logd("Section Names: " + l.dump(Object.keys(blocks)))
	context._makeSectionBlocks_Cache = blocks;
	return blocks;
}

function _makePartials(context) {
	if (!!context._makePartials_Cache){
		return context._makePartials_Cache;
	}

	var partials = { };

	// iterate all the partials we found and load them using two names:
	//    their original filename (eg header.inc.html)
	//		their 'shortened' filename (eg header.inc)
	for (var name in context.partials) {
		var partial = context.partials[name];

		// allow search for 'snippet.tex' as well as 'snippet'
		partials[name] = partial.fields.content;
		partials[path.basename(name, path.extname(name))] = partials[name]
	}
	context._makePartials_Cache = partials;
	return partials;
}



/*
The data structures:

fields are a simple list/map: 
  "content": "<p>This is a standard About page.</p>",
  "date": "2012-2-11 8:27",
  "title": "About the Demo Site",
  "metadesc": "About the ergo-cms skeleton demo site",
  "metakeys": "about",
  "extracss": "aboutpage",
  "tags": "freedom,about",
  "site_url": "http://demosite.example.com",
  "author": "Demo Author",
  "date.day": "11",
  "date.month": "Feb",
  ...
  "date.atom": "2012-02-10T21:27:00.000Z",
  "post_type": "article",
  "_template": "{include:header.inc.html}\n{content}\n{include:footer.inc.html}\n",
  "item_template": "articleentry.tem.html"




context.fields are NOT flat (but _makeSectionBlocks() fixes this):
{
  "post_type": {
    "article": [
    	'about.tex'
    ],
    "blog": [
    	'blog/a first post.md'
    	, 'blog/a second post.tex'
    ]
  },
  "tags": {
    "freedom": [  // same as above: it's the list of filenames
    	'about.tex'
    	, 'blog/a first post.md'
    ],
    "about": [
    	'about.tex'
    ]
  }
}


*/


// When making a mustache plugin, the only thing really needed is similar functionality as this function:
// 		- Use fields._template as a source, if available, otherwise use fields.content (aka text parameter)
// 		- merge fields here with those in context.fields (in a non-desctructive manner)
function _renderMain(text, _fields, fileInfo, context) 
{ 
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't tag building blocks, they're done when they're included/snippeted,
		// as their content may change depending upon the file being included into.
		return text;

	var options = _.extend({}, 
			default_options, 
			this.plugin_options, {
				partials: _makePartials(context),
				defaults: _makeSectionBlocks(context),
				//log: l.If(fileInfo)
			});

	// might be just a sitemap or similar
	var fields = _.extend({}, context.config.default_fields, _fields);

	// there are two paths:
	var templated = !!fields.template_content;
	if (templated) {
		l.logdIf(fileInfo,0, "Detagging '"+fileInfo.relPath+"' using template field");

		// First, make sure we render any tags in the 'content' 
		_fields.content = usematch.render(_fields.content, fields, options)
		fields.content = _fields.content;
		//l.logdIf(fileInfo, 2, "Finished rendering content for '"+fileInfo.relPath+"': " + _fields.content);

		//l.logdIf(fileInfo, 3, "The template for '"+fileInfo.relPath+"': \n" + _fields.template_content);
		//options.log = l.If(fileInfo)
		_fields.template_content = usematch.render(_fields.template_content, fields, options);
		text = _fields.template_content;


	}
	else {
		l.logdIf(fileInfo, 0, "Detagging '"+fileInfo.relPath+"' using content field");
		text = _fields.content = usematch.render(_fields.content, fields, options);
	}
	l.logdIf(fileInfo, 2, "Final "+(templated?"(templated) ":"") +"text: \n" + l._colors.FgGreen + text.substr(0,1000) + l._colors.Reset);

	return _fields.content; // make sure we return the CONTENT, not necessarily the templated text we've calculated here. 
}




