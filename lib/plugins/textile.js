/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _textile = require('textile-js');
var l = require('ergo-utils').log.module('ergo-plugins-textile')
var _ = require('ergo-utils')._;
l.color = l._colors.FgYellow;

module.exports = {
	registeras: plugin.RENDERER_TEXTILE, 
	extensions: "tex,textile",
	render: function(text, fields, fileInfo, context) { 
			var s = _textile(text, _.extend({breaks:false}, this.plugin_options));
			l.logdIf(fileInfo, 3, "Content is: " + s); 
			return s; 
	},
	init: function(context, options){
		this.addPreRenderer(plugin.RENDERER_HEADER_READ)
		this.addPostRenderer(plugin.RENDERER_TEMPLATE_MAN);

	}
	

}
