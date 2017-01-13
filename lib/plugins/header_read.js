/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-header-read');
var _  = require('ergo-utils')._;
const jsinf = require('jsinf').decode;
var plugin = require('../../api/plugin');
l.color = l._colors.FgMagenta;


plugin
	.addRenderer(plugin.RENDERER_HEADER_READ, { // name MUST match the filename
		renderFn: _readHeaders
	})
	.addPostRenderer(plugin.RENDERER_ADD_DATA);


function _readHeaders(text, _fields, fileInfo, context) 
{
	var _config = context.config;// for easier access
	//l.vvlogd('fields are: ' + l.dump(_fields))

	// step 1.
	/*
	// trim out the header area as json (/js)
	// Maybe this could be an option. The Jeyklls and Ghosts of the world use other (yucky yaml)
	var fields = {};
	if (text[0] == '{') { // we have a json header (as expected)
			/ * Match the following:
			{     <=== first character!
			field:value
			}
			* /
		text = text.replace(/^{([\s\S]*?)\s*[\n]\s*}\s*[\n]/, //note the '\s*}\s*[\n]' it matches a } at the end of a line. It's what we finish with
			function(match) {
				l.vvlogd("Loading JSON: " + match)
				try { 
					fields = obj_parse(match); 
					l.logdIf(fileInfo, 2, "Header fields for '"+fileInfo.relPath+"' are: " + l.dump(fields));
				}
				catch(e) {
					l.logw("Failed to read the header of '"+fileInfo.relPath+"': " + e.message)
					//throw e;
				}
				return '';
			})
	}
	*/
	var fields = jsinf(text, { 
				block_divider: "\#\#\#+", 
				default_key: "content"
			})
	l.logdIf(fileInfo, 2, "Content is: " + fields.content)

	//fields.content = text;
	fields.template_content = null;
	
	// step 2.
	// ?

	// step 3.
	// Profit!
	_.extend(_fields, fields);
	return _fields.content;
}

