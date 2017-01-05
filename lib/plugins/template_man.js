/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

 "use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-templateman');
var _  = require('ergo-utils')._;
var plugin = require('../../api/plugin');

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


function _getPostTypeConfig(post_type, context) {
	return context.config.post_types[post_type] || context.config.post_types[context.config.default_post_type];
}

function __getConfigItemTemplate(post_type, context) {
	var item_template = context.config.post_types[post_type]['item_template'];
}
function _renderTemplate(content, _fields, fileInfo, context) 
{ 
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't use building blocks, they're done when they're included/snippeted
		return content;

	var fields = _fields;
	var pt_config = _getPostTypeConfig(fields.post_type, context);
	var item_template = fields['item_template'] || pt_config['item_template'];

	// now that we have the name, lookup the layouts for the template
	var _template = context.lookupLayoutByName(item_template);
	if (!_template) {
		l.logw("Couldn't find template '"+item_template+"', OR the default '" +default_item_template_name+ "'")
		return content;
	}

	l.logd("Using '"+item_template+"' as template for '" + fileInfo.relPath + "'...")
	var _template_content = _template.fields.content.toString(); 
	fields = _.extend({}, _template.fields, fields, {_template:_template_content, item_template:item_template}) // merge any templateed field variables into ours
	_.extend(_fields, fields);

	return content; 
}




