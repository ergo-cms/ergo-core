/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

 "use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-templateman');
var _  = require('ergo-utils')._;
var plugin = require('../../api/plugin');
l.color = l._colors.FgBlue;


plugin.addRenderer(plugin.RENDERER_TEMPLATE_MAN, { // name MUST match the filename
	  extensions: "tem,tpl"
	, renderFn: _renderTemplate
	, calcExtensionFn: _calcExtension
	//, reconfigureFn: function(render_options) { }
	//, saveFn: function(context) { nothing to save; }
}).addPostRenderer(plugin.RENDERER_TAG);
//_marked.setConfig({});

function _calcExtension(filename, currentExt) {
	// simply return the rightmost extension
	var ext = filename.split('.').slice(-1);
	if (ext=='tem' || ext=='html')
		// revert to html if no better option.
		// The html check is here to rename 'tem.html' to '.hubla' if 'hubla' has been set as the new default extension
		return plugin.DEF_EXTENSION;
	return ext;
}


function _renderTemplate(text, fields, fileInfo, context) 
{ 
	return text; 
}




