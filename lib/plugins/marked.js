/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _marked = require('marked');


plugin.addRenderer(plugin.RENDERER_MARKDOWN, { 
	  extensions: "md,markdown"
	, renderFn: function(text) { return _marked(text) }
	//, reconfigureFn: function(render_options) { this.md_options = render_options; }
	//, saveFn: function(context) { nothing to save; }
}).addPreRenderer(plugin.RENDERER_TAG)
//_marked.setConfig({});