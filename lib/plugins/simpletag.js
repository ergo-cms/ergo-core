/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-simpletag');
var _  = require('ergo-utils')._;
var path = require('path');

var json_parse = require('../not_json').parse;
var plugin = require('../../api/plugin');
//l.color = l._colors.FgGreen;

var renderer = plugin.addRenderer(plugin.RENDERER_TAG, { // name MUST match the filename
  	  extensions: "tem,tpl"
  	, renderFn: _renderMain
	, calcExtensionFn: _calcExtension
}).addPreRenderer(plugin.RENDERER_HEADER_ADD);

var default_options = {
	  tag_start: "{"
	, tag_end: "}"
	, block_start: "begin:{name}" // NB: the {name} here is independent to the above tag start/stop
	, block_end:   "end:{name}"
	, if_start: "if:{name}"
	, not_if_start: "!:{name}"
	, if_else: "else"
	, if_end: "end" // can cause issues if same as block_end, or nested! so dont!
	, include: "include:{name}" // name is any partial
	, snippet: "snippet:{name}" // name is any partial. TODO. Remove this? always allow 

	// call out to a plugin start, stop?
	// could be *very* useful. The 'content' is passed to the plugin's render method. 
	//		Would probably need to skip pre/post render
	// plugin_start: "plugin:{name}"
	// plugin_end: "/plugin:{name}"
	// eg. a 'javascript renderer' could eval the following: (& allow all sorts of nasties!)
	/*
	{plugin:js}titleCase({foo});{/plugin:js}
	*/
};

/*
This is all rather dodgey stuff. A proper implemtation would be an AST style parser.

(This was largely copied from an old (personal) js project, which came from an even older c++ project)
*/


function _calcExtension(filename, currentExt) {
	// simply return the rightmost extension
	var ext = filename.split('.').slice(-1);
	if (ext=='tem' || ext=='html')
		// revert to html if no better option.
		// The html check is here to rename 'tem.html' to '.hubla' if 'hubla' has been set as the new default extension
		return plugin.DEF_EXTENSION;
	return ext;
}

function ReBuilder(options, params) {
	this.params = _.extend({}, options, params||{escape:true});
	this.sections =  [];
	this.re = null;
	this.numParams = 0;
}

ReBuilder.prototype.push = function(exact) { // just push exact bit of string
	this.sections.push(exact);
	return this; // chain ourselves
};

ReBuilder.prototype.addEsc = function(str, force) { // escapes things
	if (this.params.escape || force)
		str = str.replace(/(\W)/g, "\\$1"); // put an escape (\) in front of any symbol-esque chars.
	return this.push(str);
};

ReBuilder.prototype.add = function(str, name, has_params) { // makes {name} or {name (.*?)} -ish
	this.push(this.params.tag_start)
		.addEsc(str.replace('{name}', name||''));
	if (!!has_params) {
		this.numParams++;
		this.push("\\s*(?:\\s+(.+?)\\s*)?");
	}
	return this.push(this.params.tag_end);
};

ReBuilder.prototype.addCaptureParams = function(str, name) { // makes {name (.*?)} - ish
	return this.add(str, name, true);
};

ReBuilder.prototype.addMultiCapture = function() {
	this.numParams++;
	return this.push('([\\s\\S]*?)');
};

ReBuilder.prototype.addCapture = function() {
	this.numParams++;
	return this.push('(.*?)');
};

ReBuilder.prototype.addBlock = function(name) { // makes: {begin:name} .... {end:name} , where .... == .*? -ish
	return this.addCaptureParams(this.params.block_start, name)
		.addMultiCapture()
		.add(this.params.block_end, name)
};

ReBuilder.prototype.addIfElseBlock = function(ifIfElseNotIf, name) { // makes: {if:name} .... (?:{else} ....)? {end} , where .... == .*? -ish
	return this.add(ifIfElseNotIf ? this.params.if_start : this.params.not_if_start, name)
		.addMultiCapture()
		.push('(?:')
		.add(this.params.if_else, name)
		.addMultiCapture()
		.push(')?')
		.add(this.params.if_end, name)
};

ReBuilder.prototype.build = function() {
	if (!this.re) {
		//l.vvlogd('building re: ' +this.sections.join(''))
		this.re = new RegExp(this.sections.join(''), 'gi')
	}
	return this.re;
};

ReBuilder.prototype.exec = function(str, valueOrFn) {
	return str.replace(this.build(), valueOrFn);
};

// this doesn't actually 'make'... but starts it off. &ends with .build()....or exec(str, function())
function _makeRe(options, params) { return new ReBuilder(options, params); }



/*
var _escRe = function(s) { return s.replace(/(\W)/g, "\\$1"); } // put an escape (\) in front of any symbol-esque chars.

//function __makeRe(str, name, capture_parameters, escape_tag, options) { 
function __makeRe(str, name, opts, props) { 
	// eg 
	// _makeRe("begin:{name}", "post", false, {tag_start:"##",tag_end:"##"} ) 
	//		==> /\#\#begin\:post\#\#/gi

	// _makeRe("begin:{name}", "post", true, {tag_start:"{=",tag_end:"=}"} ) 
	//		==> /\{\=begin\:post\s*(?:\s+(.+?)\s*)?\=\}/gi
	//
	var strCapture = !!props.has_params ? "\\s*(?:\\s+(.+?)\\s*)?" : "";
	var tag = str.replace(/\{name\}/g, name);
	if (!!props.escape)
		tag = _escRe(tag);
	str = _escRe(props.options.tag_start) + tag + strCapture + _escRe(props.options.tag_end);
	return new RegExp(str, "gi");
}

function _makeRe(str, name, options, params) { 
	// used by simple things: if, simple tags, block, but not lists. eg. {title}
	params = _.extend({}, params || {escape:true}, {options:options});
	return __makeRe(str, name, { escape:true, options:options } ); 
} 
function _makeCaptureRe(str, name, options, params) { 
	// used by includes, lists, etc
	// they have parameters:.eg. {include:something some_params go here}
	params = _.extend({}, params || {escape:true}, {options:options, has_params:true});
	return __makeRe(str, name, params); 
} 
function _makeBlockCaptureRe(str_begin, str_end, name, options, params) {
	params = _.extend({}, params || {escape:true}, {options:options});
	var re_begin = _makeCaptureRe(str_begin, name, options, params);
	var re_end   = _makeRe(str_end, name, options, params);
	return new RegExp(re_begin.source + "([\\s\\S]*?)" + re_end.source, "gi");
}

function _makeIfElseEndRe(str_begin, str_else, str_end, name, options, params) {
	params = _.extend({}, params || {escape:true}, {options:options});
	var re_if   = __makeRe(str_begin, name, params);
	var re_else = __makeRe(str_else, name, params);
	var re_end  = __makeRe(str_end, name, params);
	return new RegExp(re_if.source + "([\\s\\S]*?)(?:" + re_else.source + "([\\s\\S]*?))?" + re_end.source, "gi");
}


function _makeBlockEmptyCaptureRe(str_begin, str_end, options, main_capture_text) {
	main_capture_text = main_capture_text || '[\\s\\S]*?'
	var re_begin = __makeRe(str_begin, ".*?", {options:options});
	var re_end   = __makeRe(str_end, ".*?", {options:options});
	var re= new RegExp(re_begin.source + main_capture_text + re_end.source, "gi");
	l.vlogd("empty re: "+re.source);
	return re;
}
*/


function _paramsToObj(params, inf, filename) {
	try {
		return json_parse('{'+(params||'')+'}');
	}
	catch(e) {
		l.loge("Error in '"+filename+"': " + _.niceStackTrace(e));
		return {};
	}
}


function __renderRegion(text, fields, inf) {
	var o = inf.options;
	l.logd('__renderRegion')

	for(var key in fields) {
		var value = fields[key];
		var not = !value || _.isEmptyString(value);

		// handle {!if:field} {else} {end} block
		text = _makeRe(o)
			.addIfElseBlock(false, key)
			.exec(text, function(match,p1,p2,offset) {
					l.logd("renderRegion !if match: " + l.dump([match,p1,p2,offset]) )
					return not ? p1 : p2 || '';
				});

		// handle {if:field} {else} {end} block
		text = _makeRe(o)
			.addIfElseBlock(true, key)
			.exec(text, function(match,p1,p2,offset) {
					l.logd("renderRegion if match: " + l.dump([match,p1,p2,offset]) )
					return (!not) ? p1 : p2 || '';
				});

		// handle {field}
		text = _makeRe(o)
				.add(key, '')
				.exec(text, value)
	}
	//l.vvlogd("renderRegion: "+text)
	return text;
}


function __replaceBlockList(text, params, list, inf) {
	l.logd('__replaceBlockList')
	var template = text;
	var texts = [];
	list.forEach(function(fields) {
		//l.vvlog("replaceBLockList field: "+l.dump(fields).substr(0,300));
		texts.push(__renderRegion(template, fields, inf));
	})
	//l.vvlogd("replaceBlockList: " + texts.join(""))
	return texts.join("");
}

function __renderBlock(text, block_name, block_list, inf) 
{
	l.logd('__renderBlock(' + block_name +')')

	text = _makeRe(inf.options)
			.addBlock(block_name)
			.exec(text, function(match,p1,p2,offset) {
					l.vlogd("renderBlock matches: " + l.dump([match,p1,p2,offset]) )
					// NB: the first capture is params, the 2nd is the block contents/text.
					return __replaceBlockList(p2, _paramsToObj(p1, block_name), block_list, inf);
				})
	//l.vvlogd("\n\n\n\nrenderBlock (final): '"+inf.fileInfo.relPath+"' :" + text.substr(0,500))
	return text;

}



function _renderBlocks(text, inf)
{
	l.logd('_renderBlocks')
	// search for blocks {begin:XXX} and {end:XXX}

	var blocks = { }
	// walk the global fields and generate a 'flatter' list of block elements
	// NB: give preference to article_type when name conflicts occur
	for (var key in inf.gfields) {
		// key is eg. post_type, tags, or category
		var is_post_type = key=='post_type';

		for (var key2 in inf.gfields[key]) {
			// key2 is eg. 'article', 'blog', or category 'some_category'
			if (blocks[key2] && !is_post_type || !blocks[key2])
				blocks[key2] = inf.gfields[key][key2]
		}
	}

	for (var block_type in blocks)
	{
		text = __renderBlock(text, block_type, blocks[block_type], inf);
	}
	
	return text;
}

function _renderIncludes(text, inf) {
	var o = inf.options;
	l.logd('_renderIncludes')

	// snippets and includes get the same treatment here:
	var partials = inf.context.partials;
	for (var name in partials) {
		var partial = partials[name];

		// search for 'snippet.tex' as well as 'snippet'
		[name,path.basename(name, path.extname(name))].forEach(function(_name) {
			// includes and snippets are the same
			[o.include, o.snippet].forEach(function(re_str) {
				l.vlogd('testing '+re_str+' for '+_name)
				text = _makeRe(o)
					.addCaptureParams(re_str, _name)
					.exec(text, function(match, p1) {
							// found an include, see if there are params included:
							p1 = _paramsToObj(p1, inf, inf.fileInfo.relPath + "'' for '" + _name);
							var new_inf = _.extend({}, inf)
							new_inf.fields = _.extend({},p1,new_inf.fields)
							var new_text = partial.fields.content;
							new_inf.fields.content = new_text;
							l.logd("Including '"+name+"'... " + l.dump(p1))
							//l.vvlogd("\n\n\n\n\nIncluding '"+_name+"' with params: " + l.dump(p1) + ": " + l.dump(new_inf.fields))// + new_text.substr(0,30))

							// re-render now with an updated inf (that includes the parameters)
							new_text =  _render(new_text, new_inf);
							l.vlogd("Including '"+name+"' done")
							return new_text
						})
			})

		})
	}
	return text;
}

function _renderUnusedFields(text, inf)
{
	l.logd('_renderUnusedFields')
	var o = inf.options;
	// TODO ignoring style & script blocks, remove all { }
	const wild_name = '.*?';
	text = _makeRe(o, {escape:false})
			.addBlock(wild_name)
			.exec(text, '');

	// handle {if:.*?} .... {else} .... {end}, replacing with the 2nd ....
	text = _makeRe(o, {escape:false})
			.addIfElseBlock(true, wild_name)
			.exec(text, function(match, p1, p2) {// the 'else' is obviously true
				return p2 || '';
			}); 

	// handle {!:.*?} .... {else} .... {end}, replacing with the 1st ....
	text = _makeRe(o, {escape:false})
			.addIfElseBlock(false, wild_name)
			.exec(text, '$1'); // the 'else' is obviously true

	/*
	text = text.replace(_makeBlockEmptyCaptureRe(o.block_start, o.block_end, o), '');
	text = text.replace(_makeBlockEmptyCaptureRe(o.if_start, o.if_end, o), '');
	text = text.replace(_makeBlockEmptyCaptureRe(o.not_if_start, o.if_end, o, '([\\s\\S]*?)'), '$1');

*/

/*	// fields matching {begin:someblock}\n\nSome Text{endb}
	// returns ''
	text = text.replace(/{begin:.*?}.*?{endb}/g, "");
	text = text.replace(/{list:.*?}.*?{endl}/g, "");
	text = text.replace(/{if\:.*?}.*?{end}/g, "");
	text = text.replace(/{\!\:.*?}.*?{end}/g, IfnFields_match);
	var _scriptMatches = MatchBlock(text, "<script", "</script>");
	var _styleMatches = MatchBlock(text, "<style", "</style>");
	var _ignoreBlocks = _scriptMatches.concat(_styleMatches);
	var _unusedBlocks = MatchBlock(text, "{", "}", _ignoreBlocks);
	for (var i=_unusedBlocks.length-1; i>=0; i--)
	{
		// returns "", unless 'somekey' is in config file
		var b = _unusedBlocks[i];
		var field = text.substr(b.index+1, b.length - 1);
		var value = _config.default_fields[field] || "";
		text = text.slice(0,b.index) + value + text.slice(b.index+b.length+1);
	}
*/
	return text;
}




function _render(text, inf) {
	//l.vvlogd("render fields: " + l.dump(inf.fields).substr(0,300));
	text = _renderIncludes(text, inf);
	text = _renderBlocks(text, inf);
	text = __renderRegion(text, inf.fields, inf);
	text = __renderRegion(text, inf.gfields, inf);
	text = _renderUnusedFields(text, inf);// always keep this as the last thing to do
/*
	//var text = values["content"];
	text = renderBlocks(text);

	text = ProcessIncludes(text, values);
	text = processSimpleFields(text, values);
	text = ProcessSnippets(text);
	text = ProcessUnusedFields(text);// always keep this as the last thing to do
*/
	return text;

}

/*
The data structures:

fields are a simple list: 
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
  "date.year": "2012",
  "date.time": "08:27",
  "date.formatted": "11 Feb 2012",
  "date.rss": "Fri, 10 Feb 2012 21:27:00 GMT",
  "date.iso": "2012-02-10T21:27:00.000Z",
  "date.utc": "Fri, 10 Feb 2012 21:27:00 GMT",
  "date.atom": "2012-02-10T21:27:00.000Z",
  "post_type": "article",
  "_template": "{include:header.inc.html}\n{content}\n{include:footer.inc.html}\n",
  "item_template": "articleentry.tem.html"

context.fields are NOT flat:
{
  "post_type": {
    "article": [
      {
        "site_url": "http://demosite.example.com",
        "title": "About the Demo Site",
        "author": "Demo Author",
        "date": "2012-2-11 8:27",
        ...
        "content": "This is a standard About page. Note that we have specified an 'extracss' in the source document, which changes the color of the navigation area.",
        "metadesc": "About the ergo-cms skeleton demo site",
        "metakeys": "about",
        "extracss": "aboutpage",
        "tags": "freedom,about",
        "post_type": "article"
      },
      {
        "site_url": "http://demosite.example.com",
        "title": "Demo Site - 404",
        "author": "Demo Author",
        "date": "Mon, 02 Jan 2017 03:10:52 GMT",
        ...
      }
    ],
    "blog": [
      {
        "site_url": "http://demosite.example.com",
        "title": "True Love's First Kiss",
        "author": "The Blogger",
        "date": "2012-06-21",
        ...
        "metakeys": "first post,ergo-cms",
        "post_type": "blog"
      },
      {
        "site_url": "http://demosite.example.com",
        "title": "True Love's Second Kiss",
        "author": "The Blogger",
        "date": "2012-06-22",
        ...
        "metakeys": "second post,ergo-cms",
        "extracss": "blogpost 2ndpost",
        "post_type": "blog"
      }
    ]
  },
  "tags": {
    "freedom": [
      null,
      null
    ],
    "about": [
      null
    ]
  }
}


*/


// When making a mustache plugin, the only thing really needed is similar functionality as this function:
// 		- Use fields._template as a source, if available, otherwise use fields.content (aka text parameter)
// 		- merge fields here with those in context.fields (in a non-desctructive manner)
function _renderMain(text, fields, fileInfo, context) 
{ 
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't tag building blocks, they're done when they're included/snippeted
		return text;

	var options = _.extend({}, default_options, this.plugin_options);

	// might be just a sitemap or similar
	fields = _.extend({}, context.config.default_fields, fields);

	var inf = { // *THIS* is the meta info we pass around as a parameter in the above functions
		  fields:fields
		, gfields:context.fields
		, fileInfo:fileInfo
		, options:options
		, context:context
	}


	// there are two paths:
	var template;
	if (!!fields['_template']) {
		l.vlogd("Detagging '"+fileInfo.relPath+"' using template field");
		template = fields['_template'];
	}
	else {
		l.vlogd("Detagging '"+fileInfo.relPath+"' using content field");
		template = text;
	}

	text = _render(template, inf)
	l.vvlogd("Final Text: " + l._colors.FgRed + text.substr(100,300));

	fields.content = text;
	return text; 
}




