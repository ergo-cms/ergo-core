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
	// Maybe this could be an option. The Jeyklls and Ghosts of the world use other
	var fields = "{}";
	if (text[0] == '{') // we have a json header (as expected)
	{
		var end = text.indexOf("}");
		if (end > 0 && text.substr(0, end ).indexOf("\n")>0) // assume the json header is longer than one line
		{
			fields = text.substr(0, end + 1);
			text = text.substr(end + 1).trim();
		}
	}

	try {
		l.vvlogd("Loading JSON: " + fields)
		fields = obj_parse(fields);
	}
	catch(e) {
		l.logw("Failed to read the header of '"+fileInfo.relPath+"': " + _.niceStackTrace(e))
		fields = {};
	}
	fields.content = text;
	
	// step 2.
	// ?

	// step 3.
	// Profit!
	_.extend(_fields, fields);
	return _fields.content;
}

