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
plugin
	.addRenderer(plugin.RENDERER_TEXTILE, { // name MUST match the filename
		  extensions: "tex,textile"
		, renderFn: function(text, fields, fileInfo, context) { 
			var s = _textile(text, _.extend({breaks:false}, this.plugin_options));
			l.logdIf(fileInfo, 3, "Content is: " + s); 
			return s; 
		}
		//, reconfigureFn: function(options) { }
		//, saveFn: function(context) { nothing to save; }
	})
	.addPreRenderer(plugin.RENDERER_HEADER_READ)
	.addPostRenderer(plugin.RENDERER_TEMPLATE_MAN);

