/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _marked = require('marked');


module.exports = {
	registeras: plugin.RENDERER_MARKDOWN, 
	extensions: "md,markdown",
	render: function(text) { return _marked(text, this.plugin_options) },
	init: function(context, options) {	
		this.addPreRenderer(plugin.RENDERER_HEADER_READ)
		this.addPostRenderer(plugin.RENDERER_TEMPLATE_MAN)
	}
}
