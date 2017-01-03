/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var plugin = require('../../api/plugin');

var renderer = plugin.addRenderer(plugin.RENDERER_TAG, { 
	  extensions: "tem"
	, renderFn: _renderSimpleTag
	//, reconfigureFn: function(render_options) { this.textile_options = render_options; }
	, calcExtensionFn: function(filename) {
		// simply return the rightmost extension
		return filename.split('.').slice(-1)
	}
})

function _renderSimpleTag(text, fileInfo, context) 
{ 
	return text; 
}




// export nothing! module.exports = renderer;