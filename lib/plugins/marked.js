/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _marked = require('marked');


plugin
	.addRenderer(plugin.RENDERER_MARKDOWN, { // name MUST match the filename
		  extensions: "md,markdown"
		, renderFn: function(text) { return _marked(text, this.plugin_options) }
		//, reconfigureFn: function(options) { }
		//, saveFn: function(context) { nothing to save; }
	})
	.addPreRenderer(plugin.RENDERER_HEADER_READ)
	.addPostRenderer(plugin.RENDERER_TEMPLATE_MAN)
