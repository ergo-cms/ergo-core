/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-simpletag');
var _  = require('ergo-utils')._;
var plugin = require('../../api/plugin');
l.color = l._colors.FgGreen;

var renderer = plugin.addRenderer("simpletag", { // name MUST match the filename
	renderFn: _renderSimpleTag
})


/*
This is all rather dodgey stuff. A proper implemtation would be an AST style parser.

(This was largely copied from an old (personal) js project, which came from an even older c++ project)
*/




var _escRe = function(s) { return s.replace(/\W/g, "\\$1"); } // put an escape (\) in front of any symbol-esque chars.

function __makeRe(str, name, capture_parameters, escape_tag, options) { 
	// eg 
	// _makeRe("begin:{name}", "post", false, {tag_start:"##",tag_end:"##"} ) 
	//		==> /\#\#begin\:post\#\#/gi

	// _makeRe("begin:{name}", "post", true, {tag_start:"{=",tag_end:"=}"} ) 
	//		==> /\{\=begin\:post\s*(?:\s+(.+?)\s*)?\=\}/gi
	//
	var strCapture = capture_parameters ? "\s*(?:\s+(.+?)\s*)?" : "";
	var tag = str.replace(/\{name\}/g, name);
	if (escape_tag)
		tag = _escRe(tag);
	str = _escRe(options.tag_start) + tag + strCapture + _escRe(options.tag_end);
	return new RegExp(str, "gi");
}

function _makeRe(str, name, options) { return __makeRe(str, name, false, true, options); } // used by simple things: if, simple tags, block, but not lists.
function _makeCaptureRe(str, name, options) { return __makeRe(str, name, true, true, options); } // used by includes, lists, etc
function _makeBlockCapture(str_begin, str_end, name, options) {
	var re_begin = _makeCaptureRe(str_begin, name, options);
	var re_end   = _makeRe(str_end, name, options);
	return new RegExp(re_begin.source + "(.*?)" + re_end.source, "gi");
}



function _renderUnusedFields(text, options)
{
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

function _renderBlock(text, post_type, post_type_options, context) 
{
	var config = context.config;
	post_type_options = _.extend({}, config.post_types[config.default_post_type] || {}, post_type_options || {});
	// TODO. Need to postpone until ALL data for all pages have been received.
	// (So that we can get a list of posts, with their field data)
}



function _renderBlocks(text, context)
{
	// search for blocks {begin:XXX} and {endb}
	var config = context.config;
	var post_types = config.post_types; // gathered from config.post_types
	for (var post_type in post_types)
	{
		text = renderBlock(text, post_type, post_types[post_type], context);
	}
	
	// special case, an "all" block
	text = renderBlock(text, "all", _files_all_filtered);
	// TODO. Not really useful without a method to create a page for each tag
	//text = renderBlock(text, "tags", tags);	
	return text;
}

function _renderSimpleTag(text, fields, fileInfo, context) 
{ 
	var options = _.extend({}, this.plugin_options, {
			  tag_start: "{"
			, tag_end: "}"
			, block_start: "begin:{name}" // NB: the {name} here is independent to the above tag start/stop
			, block_end:   "end:{name}"
			, if_start: "if:{name}"
			, not_if_start: "!{name}"
			, if_else: "else:{name}"
			, if_end: "/{name}" // can cause issues if same as block_end, so dont!
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
		});



	return text; 
}




