/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _textile = require('textile-js');


plugin
	.addRenderer(plugin.RENDERER_TEXTILE, { // name MUST match the filename
		  extensions: "tex,textile"
		, renderFn: function(text) { return _textile(text, this.plugin_options) }
		//, reconfigureFn: function(options) { }
		//, saveFn: function(context) { nothing to save; }
	})
	.addPreRenderer(plugin.RENDERER_HEADER_READ)
	.addPostRenderer(plugin.RENDERER_TEMPLATE_MAN);

