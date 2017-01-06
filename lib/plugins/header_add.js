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
var default_options = {
	  collate_fields: "post_type,category,tags" // this plugin watches these fields and makes collated data for them.See **
	, collate_data: "*"
}
//
//
// ** Collated Fields. When collating data for a field (specified in the 'collate_fields' propert), 
//    the metrics in the 'collate_data' is collected. By default, this is everything (eg title, date, url, content...).
//
//

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

function _getCollatedFields(fields, options) {
	if (options.collate_data=='*')
		return fields;
	var _wanted_fields = _.toRealArray(options.collate_data, ',');
	return fields.filter(function(key) {
		return _wanted_fields.indexOf(key)>=0;
	})
}

function _collateData(fields, options, fileInfo, context) {
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't collate building blocks!
		return;

	var collated_fields = _.toRealArray(options.collate_fields || '', ',');
	//l.vvlogd('Collated fields are: ' + l.dump(collated_fields))
	collated_fields.forEach(function(field) {
		if (!fields[field])
			return; // this file doesn't use the field (eg, tags)
		// the field is something like 'post_type' or 'tags', or 'category'
		//l.vvlogd("Collating '"+field+"': " + fields[field] + " for '" + fileInfo.relPath + "'")
		// eg. field.post_type is 'article' or field.tags is 'some,list,of,tag'
		var ar = _.toRealArray(fields[field], ','); 

		// add the individual names of types. 
		// eg. the list post_types:
		// 		context.fields.post_type = { article:[], blog:[] }
		if (!context.fields[field]) context.fields[field] = { }; 
		var _field = context.fields[field];
		ar.forEach(function(field_value) {
			if (!_field[field_value]) _field[field_value] = [];

			// make it:
			// context.fields.post_type.article = [
			//		{ title:'page 1', url:'page1.html',content:'page 1 is here' ... }
			//		{ title:'page 2', url:'page2.html',content:'page 2 is here' ... }
			// ]
			var c = _getCollatedFields(fields, options);
			_field[field_value].push(_.extend({}, c)); // make sure we *copy* rather than *reference* the existing objs
			l.vvlogd("Collated '"+field+"."+field_value+"' (count="+_field[field_value].length+") for '" + fileInfo.relPath + "'");
		})

	})
}
function _addHeaders(text, _fields, fileInfo, context) 
{
	if (_.isDefined(fileInfo['__'+plugin.RENDERER_HEADER_ADD])) {
		l.logd("Skipping retagging '"+fileInfo.relPath+"'");
		return text;
	}

	fileInfo['__'+plugin.RENDERER_HEADER_ADD] = plugin.RENDERER_HEADER_ADD;



	var fields = _fields;
	var _config = context.config;// for easier access
	var options = _.extend({}, default_options, this.plugin_options);

	// step 1.
	// manufacture/prepare some common fields that will probably be needed later
	// Not sure if this should be pluggable too
	//fields["title"] = fields["title"] || toTitleCase(basename)); // ensure there's a title!
	fields = _addDateFields(fields, fileInfo, _config.date_format)
	fields = _.extend({
			uri:fileInfo.destRelPath
		}, fields)


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
	//l.vvlogd("Fields are: " + l.dump(fields))

	_collateData(fields, options, fileInfo, context);

	// step 3.
	// Profit!
	_.extend(_fields, fields); // we've always made sure that the original fields values are kept intact, so this is ok to copy all the new fields back in
	return _fields.content;
}

