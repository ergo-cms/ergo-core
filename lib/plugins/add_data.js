/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-add-data');
var _  = require('ergo-utils')._;
var plugin_api = require('../../api/plugin');
l.color = l._colors.FgMagenta;


module.exports = {
	registeras: plugin_api.RENDERER_ADD_DATA,
	render: _addHeaders,
	init: function(context, options) {
		this.addPostRenderer(plugin_api.RENDERER_COLLATE);	
	}
};


var default_options = {

}




var _regexIndexOf = function(str, regex, startpos) {
    var indexOf = str.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
}

var _regexLastIndexOf = function(str, regex, startpos) {
    regex = (regex.global) ? regex : new RegExp(regex.source, "g" + (regex.ignoreCase ? "i" : "") + (regex.multiLine ? "m" : ""));
    if(typeof (startpos) == "undefined") {
        startpos = str.length;
    } else if(startpos < 0) {
        startpos = 0;
    }
    var stringToWorkWith = str.substring(0, startpos + 1);
    var lastIndexOf = -1;
    var result;
    while((result = regex.exec(stringToWorkWith)) != null) {
        lastIndexOf = result.index;
        regex.lastIndex = result.index+1;
    }
    return lastIndexOf;
}


function _field__short_content() {
	var c = this.content;
	var breakat = _regexIndexOf(c, /\. /, 200);
	if (breakat>350) {
		var breakat2 = _regexLastIndexOf(c, /\. /, breakat);
		if (breakat2 > 80)
			breakat = breakat2;
	}
	if (breakat>-1) {
		c = c.substr(0,breakat+1)+'</p>'; // the closing p is because we've probably chopped it off!
	}
	return c;
}

function _filter_split(data, params) {
	if (_.isArray(data)) 
		return data;
	return data.toString().split(params.char || ',').map(function(el) { return el.replace(/^\s*(.*)\s*$/, "$1")} );
}



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
		// handle the easy one first. It's been explicitly defined
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
	if (_.isDefined(fileInfo['__'+plugin_api.RENDERER_ADD_DATA])) {
		l.logd("Skipping retagging '"+fileInfo.relPath+"'"); // this shouldn't happen now that the rendering pipline explicitly prohibits 'double rendering'
		return text;
	}

	fileInfo['__'+plugin_api.RENDERER_ADD_DATA] = plugin_api.RENDERER_ADD_DATA;



	var fields = _fields;
	var _config = context.config;// for easier access
	var options = _.extend({}, default_options, this.plugin_options);

	// step 1.
	// manufacture/prepare some common fields that will probably be needed later
	// Not sure if this should be pluggable too
	//fields["title"] = fields["title"] || toTitleCase(basename)); // ensure there's a title!
	fields = _addDateFields(fields, fileInfo, _config.date_format)
	fields = _.extend({
			uri: fileInfo.destRelPath.replace(/\\/g, '/'),
			fileInfo: {
				path: fileInfo.path,
				relPath: fileInfo.relPath,
				destRelPath: fileInfo.destRelPath,
				destPath: fileInfo.destPath
			},
			short_content: _field__short_content, // a function that dynamically returns a 'short_content'
			split: _filter_split,
		}, fields)


	// step 2. 
	// determine the post type & incorporate any specialised 'default_fields'
	fields.post_type = _determinePostType(fields, fileInfo, _config)
	l.logdIf(fileInfo, 0, "post_type for '"+fileInfo.relPath+"' is set to '" + fields.post_type +"'")

	var extra_defaults = {};
	if (_.isDefined(_config['default_fields'])) {
		_.extend(extra_defaults, _config['default_fields']);
	}
	if (_.isDefined(_config['post_types']) && 
		_.isDefined(_config['post_types'][fields.post_type]) &&
		_.isDefined(_config['post_types'][fields.post_type]['default_fields'])) {
			var extra_fields = _config['post_types'][fields.post_type]['default_fields'];
			l.logdIf(fileInfo, 1, "extra fields for '"+fileInfo.relPath+"' are: " + l.dump(extra_fields))
			_.extend(extra_defaults, extra_fields);
	}
	fields = _.extend(extra_defaults, fields);
	//l.vvlogd("Fields are: " + l.dump(fields))

	

	// step 3.
	// Profit!
	_.extend(_fields, fields); // we've always made sure that the original fields values are kept intact, so this is ok to copy all the new fields back in

	l.logdIf(fileInfo, 2, "Content is: " + _fields.content)
	return _fields.content;
}

