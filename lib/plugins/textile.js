/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var plugin = require('../../api/plugin');
var _textile = require('textile-js');


plugin.addRenderer(plugin.RENDERER_TEXTILE, { 
	  extensions: "tex,textile"
	, renderFn: function(text) { return _textile(text, this.textile_options) }
	, reconfigureFn: function(options) { this.textile_options = options; }
	//, saveFn: function(context) { nothing to save; }
}).addPreRenderer(plugin.RENDERER_TAG)
//_textile.setConfig({})

