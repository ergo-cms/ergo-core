/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

 "use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-templater');
var _  = require('ergo-utils')._;
var plugin = require('../../api/plugin');
var _config = require('../../api/config');

module.exports = {
	registeras: plugin.RENDERER_TEMPLATE_MAN, 
	//  extensions: "tem,tpl"
	render: _renderTemplate,
	calcExtension: _calcExtension,
	init: function(context, options) {
		this.addPostRenderer(plugin.RENDERER_TAG);	
	}
}

function _calcExtension(filename, currentExt) {
	// simply return the rightmost extension
	var ext = filename.split('.').slice(-1);
	if (ext=='tem' || ext=='html')
		// revert to html if no better option.
		// The html check is here to rename 'tem.html' to '.hubla' if 'hubla' has been set as the new default extension
		return _config.DEF_EXTENSION;
	return ext;
}


function _getPostTypeConfig(post_type, fields, context) {
	var pt_config = context.config.post_types[post_type];
	var pt_config_default = context.config.post_types[context.config.default_post_type]

	return _.extend({}, pt_config_default, pt_config, fields)
}

function _renderTemplate(content, _fields, fileInfo, context) 
{ 
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't use building blocks, they're done when they're included/snippeted
		return content;

	var fields = _fields;
	var pt_config = _getPostTypeConfig(fields.post_type, fields, context);
	var layout = pt_config['layout'];

	if (!layout)
		throw new Error("No layout specified for '"+fields.post_type+"' in config.ergo.js. Please check the default post type for a 'layout'.");
	l.logIf(fileInfo, 1, "Using layout '" + layout + "' for '" + fileInfo.relPath + "'")

	// now that we have the name, lookup the layout for the template
	var _template = context.lookupLayoutByName(layout);
	if (!_template) {
		throw new Error("Couldn't find layout '"+layout+"' when rendering '"+fileInfo.relPath+"'. Please check config.ergo.js")
		return content;
	}

	l.logdIf(fileInfo, 0, "Using '"+layout+"' as template for '" + fileInfo.relPath + "'...")
	var _template_content = _template.fields.content.toString(); 
	fields = _.extend({}, _template.fields, fields, {template_content:_template_content, layout:layout}) // merge any templateed field variables into ours
	_.extend(_fields, fields); // plough all changes back (into the passed in _fields param)

	return content; 
}




