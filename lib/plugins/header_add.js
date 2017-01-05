/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-header-add');
var _  = require('ergo-utils')._;
var obj_parse = require('../not_json').parse;
var plugin = require('../../api/plugin');
l.color = l._colors.FgMagenta;


plugin
	.addRenderer(plugin.RENDERER_HEADER_ADD, { // name MUST match the filename
		renderFn: _addHeaders
	});



function _addDateFields(fields, _fileInfo, _config_dateformat) {
	var dateFormat = require('dateformat');
	//l.vlogd('date formats: ' + l.dump(_config_dateformat))
	var date = new Date(Date.parse(fields['date'] || _fileInfo.stats.ctime.toUTCString()));
	var values = {};
	values["date"] = date.toUTCString(); // ensure there's a date!
	values["date.day"] = dateFormat(date, _config_dateformat.day);
	values["date.month"] = dateFormat(date, _config_dateformat.month);
	values["date.year"] = dateFormat(date, _config_dateformat.year);
	values["date.time"] = dateFormat(date, _config_dateformat.time);
	values["date.formatted"] = dateFormat(date, _config_dateformat.full);
	values["date.rss"] = dateFormat(date, "GMT:ddd, dd mmm yyyy HH:MM:ss Z"); // strict RFC822 format for RSS.xml feeds. "ddd, dd mmm yyyy HH:MM:ss GMT"
	values["date.iso"] = date.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"        		ISO 8601  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
	values["date.utc"] = date.toUTCString(); // "ddd, dd mmm yyyy HH:MM:ss GMT"    		RFC-1123 '...a slightly updated version of RFC-822 date stamps.' ~ https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toUTCString
	values["date.atom"] = values["date.iso"]; // for ATOM.xml feeds. Uses ISO 8601
	return _.extend(values, fields);
}

function _determinePostType(fields, fileInfo, config) {
	if (fields['post_type'])
		// handle the easy one first
		return fields['post_type'];

	if (_.isDefined(config['post_types'])) {
		for (var post_type in config['post_types']) {
			var data = config.post_types[post_type];
			var relPath = data['path'] || post_type;
			if (fileInfo.isRelInDir(relPath))
				return post_type;
		}
	}

	// not in a known folder.
	return config.default_post_type;
}



function _addHeaders(text, _fields, fileInfo, context) 
{
	var fields = _fields;
	var _config = context.config;// for easier access

	// step 1.
	// manufacture/prepare some common fields that will probably be needed later
	// Not sure if this should be pluggable too
	//fields["title"] = fields["title"] || toTitleCase(basename)); // ensure there's a title!
	fields = _addDateFields(fields, fileInfo, _config.date_format)


	// step 2. 
	// determine the post type & incorporate any specialised 'default_fields'
	fields.post_type = _determinePostType(fields, fileInfo, _config)
	var extra_defaults = {};
	if (_.isDefined(_config['default_fields'])) {
		_.extend(extra_defaults, _config['default_fields']);
	}
	if (_.isDefined(_config['post_types']) && 
		_.isDefined(_config['post_types'][fields.post_type]) &&
		_.isDefined(_config['post_types'][fields.post_type]['default_fields'])) {
			_.extend(extra_defaults, _config['post_types'][fields.post_type]['default_fields']);
	}
	fields = _.extend(extra_defaults, fields);
	l.vvlogd("Fields are: " + l.dump(fields))

	/*
	// step 2b. Look for 'render_tags'. If set, we explicitly call the tag renderer on the content
	// This seems hackish and prone to problems... but it might be useful to get around *other* problems
	if (fields['render_tags']===true || this.plugin_options['render_tags']) {
		if (!this.tagRenderer && !this.plugin_options['warning_given']) {
			this.tagRenderer = plugin.getRenderer(plugin.RENDERER_TAG); // might be moustache, might be simpletag.
			if (!this.tagRenderer) {
				this.plugin_options['warning_given'] = true;
				l.loge("Can't find '"+plugin.RENDERER_TAG+"' to pre-render according to 'render_tags' setting");
			}
		}
		if (this.tagRenderer) {
			fields.content = this.tagRenderer.render(fields, fileInfo, context);
		}
	}
	*/

	// step 3.
	// Profit!
	_.extend(_fields, fields); // we've always made sure that the original fields values are kept intact, so this is ok to copy all the new fields back in
	return _fields.content;
}

