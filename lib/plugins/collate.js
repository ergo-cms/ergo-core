/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-aggregator');
var _  = require('ergo-utils')._;
var plugin_api = require('../../api/plugin');
var _config = require('../../api/config')
//var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
//var Promise = require('bluebird');

l.color = l._colors.FgMagenta;


plugin_api.addRenderer(plugin_api.RENDERER_COLLATE, { // name MUST match the filename
		renderFn: _render,
		loadFn: _load
		//saveFn: _save
	});

//plugin_api.findRendererByName(plugin_api.RENDERER_ADD_DATA).addPostRenderer(plugin_api.RENDERER_COLLATE)


/* 
Need to collate data: eg for a post:
		title = ...
		author = me
		tags = tag1,tag2
		category = free
		featured = false
		popular = true
		post_type = article
		###
		Content


Should generate
	{
		articles:[ ... ]
		tags: {
			tag1: [ ... ]
			tag2: [ ... ] 
		}
		featured: [ ... ] // exlcudes the above one, because it's falsish
		popular: [ ... ] // incudes the above one, because it's not falsish
	}


usage: {{ #tags.* }}...


*/

var default_options = {
	// key (LHS) is the name to collate as.
	//		'fields' is one or more fields that contribute, eg { post_types: {blog:[items]} }
	// if add_to_root:
	//		{ blog: [items] }
	// if multiple_values: then can be given a list of comma seperated items, which are split
	//		{ tags: { tag1:[items],tag2:[items]} }
	// if single_list: if not falsish, is added to global list:
	//		{ featured:[items]}
	"all:post_types": { fields:'post_type', add_to_root: true, filename:"sitemap.html"},
	"all:authors": { fields:'author', filename:"authors.html"},
	"all:categories": { fields:'category,categories', multiple_values: true, filename:"categories.html"},
	"all:tags": { fields:'tag,tags', multiple_values: true, filename:"tags.html"},
	featured: { fields:'feature,featured', single_list:true}, // a boolean. if featured is set then added to list
	popular: { fields:'popular', single_list:true}, // a boolean. if popular is set then added to list

}



function _collateData(fields, options, fileInfo, context) {
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't collate building blocks!
		return;

	if (!!fields['draft'])
		return; // don't collate for unpublished, or draft versions

	var dest = context.fields; 
	var data = fileInfo.relPath;

	//l.vvlogd('Collated fields are: ' + l.dump(collated_fields))
	for (var rootname in options) {
		//l.logIf(fileInfo, 0, "Collating '"+field+"' for '" + fileInfo.relPath + "'");
		var fieldInf = options[rootname];
		if (!fieldInf)
			continue; // user probably blanked something out.
		var fieldnames = _.toRealArray(fieldInf.fields||'', ',')
		fieldnames.forEach(function(field) {
			field = field.toString().replace(/^\s*/,'').replace(/\s*$/,'');
			if (!fields[field])
				return; // this file doesn't use the field (eg, tags)

			if (fieldInf.single_list) {
				if (!!fields[field]) {
					// not falsey, add
					if (!dest[rootname]) dest[rootname] = [];
					dest[rootname].push(data);
				}
				l.logdIf(fileInfo, 1, "Collated '"+rootname+"' (count="+dest[rootname].length+") for '" + fileInfo.relPath + "'");
			}
			else {
				if (!dest[rootname]) dest[rootname] = {};

				var values = fieldInf.multiple_values ? fields[field].split(',') : [fields[field]]	
				values.forEach(function(value){
					value = value.toString().replace(/^\s*/,'').replace(/\s*$/,'');
					if (value.length) {
						//add items 
						if (!dest[rootname][value]) dest[rootname][value] = [];
						dest[rootname][value].push(data);
						l.logdIf(fileInfo, 1, "Collated '"+rootname+"."+value+"' (count="+dest[rootname][value].length+") for '" + fileInfo.relPath + "'");

						if (fieldInf.add_to_root) {
							if (!dest[value]) {
								dest[value] = [];
								if (fieldInf.generate_html!==false)
									_addOutputFile(value, null, true, context); // add output file of the name
							}
							dest[value].push(data);
						}
					}
				})		
			}
		})
	}
}



function _valueToKeyValues(context) {
	var values = [];
	for (var key in context)
		values.push({key:key, value: context[key]})
	return values;

}

function _field_dynamic_list() { 
/**

// LISTS
// This bit of strangness work like this:

1. In the main part of the website, there's page (say posts.tex) that has this in the header:
	layout = list.html
	list_type = post
	list_len = 100

2. At render time, list.html has access to 'list_type' and 'list_len'. 
	The theme/user then has defined the 'list.html' layout as:
		{{#dynamic_list}} ... {{/dynamic_list}}

3. The system then ends up at the 'dynamic_list' function (here), which returns the array given: 
	eg. return this['post'], which comes from elsewhere step 1.


Why? This allows a theme to make theme-centric lists of posts/authors, tags, etc, and 
	frees up the user from worrying about such things, when changing themes
*/
	l.logd("list_type is: " + this.list_type)
	var type = this.list_type || 'page'; 
	var starpos = type.indexOf('*');
	var data = this[type];
	if (!data && starpos>0) { // NB: >0 becase we assume there's a '.' before it
		var type2 = type.substr(0, starpos-1);
		if (this[type2]) {
			// ok we have data, but not the list.* data. we can manufacture it now:
			data = _valueToKeyValues(this[type2]);
		}
	}
	if (!data)
		return [];

	return data.slice(0, this.list_len || 999);
}

function _addOutputFile(name, filename, single_list, context) {
	var renderer = plugin_api.RENDERER_TEMPLATE_MAN;
	var fields = {
		title: name.replace(/[^A-Za-z0-9]/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); }), // Camel Case
		layout: single_list ? 'list.html' : 'keyed_list.html',
		list_type: single_list ? name : name+'.*',
		list_len: 100,
		list_hide_content: true,
		content:'.',
		dynamic_list: _field_dynamic_list,
	};	
	if (!filename)
		filename = name;
	if (filename.indexOf('.')<0)
		filename += '.'+_config.DEF_EXTENSION;
	filename = path.join(path.dirname(filename), path.basename(filename, path.extname(filename))+'.'+_config.DEF_EXTENSION);
	l.vlog("Adding virtual file: '"+filename+"'...")
	return context.addVirtualFile(fields, filename, renderer);
}

// the main entry point for the plugin
function _render(text, fields, fileInfo, context) 
{
	var options = _.extend({}, default_options, this.plugin_options);
	_collateData(fields, options, fileInfo, context);
	if (!fields.dynamic_list)
		fields.dynamic_list = _field_dynamic_list;
	var dl = fields.dynamic_list;
	/*//debug dynlists...
	fields.dynamic_list = function() { 
		l.vlog("Dynlist for: " + fileInfo.relPath)
		dl.call(this)
		}
	*/
	return fields.content;
}

// called before rendering. Tell the system to add some dummy output files
function _load(context) {
	var options = _.extend({}, default_options, this.plugin_options);


	var p = null;
	var lists = {};
	for (var name in options) {
		var fieldInf = options[name];
		if (!fieldInf)
			continue; // user probably blanked something out.
		if (fieldInf.generate_html!==false)
			_addOutputFile(name, fieldInf.filename, fieldInf.single_list, context)
	}

	return true;
}

