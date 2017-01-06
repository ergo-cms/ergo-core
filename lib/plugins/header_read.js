/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-header-read');
var _  = require('ergo-utils')._;
var obj_parse = require('../not_json').parse;
var plugin = require('../../api/plugin');
l.color = l._colors.FgMagenta;


plugin
	.addRenderer(plugin.RENDERER_HEADER_READ, { // name MUST match the filename
		renderFn: _readHeaders
	})
	.addPostRenderer(plugin.RENDERER_HEADER_ADD);


function _readHeaders(text, _fields, fileInfo, context) 
{
	var _config = context.config;// for easier access
	//l.vvlogd('fields are: ' + l.dump(_fields))

	// step 1.
	// trim out the header area as json (/js)
	// Maybe this could be an option. The Jeyklls and Ghosts of the world use other (yucky yaml)
	var fields = {};
	if (text[0] == '{') // we have a json header (as expected)
			/* Match the following:
			{     <=== first character!
			field:value
			}
			*/
		text = text.replace(/^{([\s\S]*?)\s*}\s*[\n]/, //note the '\s*}\s*[\n]' it matches a } at the end of a line. It's what we finish with
			function(match) {
				l.vvlogd("Loading JSON: " + match)
				try { fields = obj_parse(match); }
				catch(e) {
					l.logw("Failed to read the header of '"+fileInfo.relPath+"': " + _.niceStackTrace(e))
					throw e;
				}
				return '';
			})
	fields.content = text;
	
	// step 2.
	// ?

	// step 3.
	// Profit!
	_.extend(_fields, fields);
	return _fields.content;
}

