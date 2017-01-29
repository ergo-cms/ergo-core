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


module.exports = {
	registeras: plugin.RENDERER_HEADER_READ,
	render: _readHeaders,
	init: function(context, options) {
		this.addPostRenderer(plugin.RENDERER_ADD_DATA);	
	}
};
	


function _readHeaders(text, _fields, fileInfo, context) 
{
	var _config = context.config;// for easier access
	//l.vvlogd('fields are: ' + l.dump(_fields))

	// step 1.

	var fields = jsinf(text, { 
				block_divider: "\#\#\#+", 
				default_key: "content"
			})
	l.logdIf(fileInfo, 2, "Content is: " + fields.content)

	//fields.content = text;
	//if (!_.isDefined(_fields['template_content']))
	fields.template_content = _fields.template_content || null; 
	
	// step 2.
	// ?

	// step 3.
	// Profit!
	_.extend(_fields, fields);
	return _fields.content;
}

