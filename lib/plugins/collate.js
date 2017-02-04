/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-collate');
var _  = require('ergo-utils')._;
var plugin_api = require('../../api/plugin');
var _config = require('../../api/config')
//var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
//var Promise = require('bluebird');

//l.color = l._colors.FgMagenta;

module.exports = {
	registeras: plugin_api.RENDERER_COLLATE,
	render: _render,
	load: _load
};

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
	//disable: false,
	generate_html: true, // this can also be set per post_type & per field
	base_name: '', // 'all' is a good option. ie 'all.blogs', 'all.tags', 'all.categories'. // This can also be set per post_type & per field. see tags & categories

	post_types: { // by default, NOTHING is collated unless: this list is modified OR collate=true on a post
		// eg.
		// article: { as: 'articles', base_name:'blah', generate_html:true},
	},
	fields: {
		category: { as: "categories", base_name:'all' }, // individual files created for each category type too, as well as categories.html
		tags: { as: "tags", base_name:'all' },
		//author: { as: 'all.authors' },
		featured: { type:"list", base_name:'' }, // 'featured' is assumed to be ON or OFF, ie Tru-ish or Fals-ish
		popular: { type:"list", base_name:'' },
	}
}


function _as(options, a, b) {
	// returns 'categories' for fields.category or 'category' if 'as' is missing
	return !options[a][b] ? b : options[a][b].as || b;
}


function _base(_root_dest, options, a,b, def) {
	// determine where data should be stored.
	// By default all items are stored in obj['categories'],
	//	but each section can override this eg obj['all']['categories']
	var base_name = !options[a][b] ? undefined : options[a][b].base_name;
	if (base_name===undefined)
		base_name = options.base_name;
	var dest = _root_dest;
	if (base_name.length>0) {
		if (!dest[base_name])
			dest[base_name] = {}; // make the new sub-object
		dest = dest[base_name];
	}
	var as = _as(options, a, b);
	if (!dest[as])
		dest[as] = def;
	return dest[as];

}

function _data_name(options, a,b) {
	// similar to above '_base()', but returns the 'dot notation' version of the root name, combined with the 'as'
	// This is for injecting into usematch, so that we find the above data
	var base_name = !options[a][b] ? undefined : options[a][b].base_name;
	if (base_name===undefined)
		base_name = options.base_name;
	if (base_name.length>0 && base_name[base_name.length-1]!='.') {
		base_name += '.';
	}
	var as = _as(options, a, b);
	return base_name + as;
}


function _should_make_html(options, a,b) {
	// determines if html files should be made.
	// By default generate_html is true,
	//	but each section can override this
	var generate_html = !options[a][b] ? undefined : options[a][b].generate_html;
	if (generate_html===undefined)
		generate_html = options.generate_html;
	return !!generate_html;
}


function _default_fields(options, a,b) {
	// determines if html files should be made.
	// By default generate_html is true,
	//	but each section can override this
	var fields = !options[a][b] ? undefined : options[a][b].default_fields;
	return fields;
}

function _addOutputFile(dataname, name, single_list, context, fileInfo, default_fields) {
	var reNonName = /[^A-Za-z0-9]/g
	if (!context['__collated_files']) 
		context.__collated_files = { };
	var partialName = context.getSafeName(name);
	var filename = partialName + '.'+_config.DEF_EXTENSION;
	if (context.__collated_files[filename])
		return; // already added
	context.__collated_files[filename] = true;

	//Allow content to be present by using a partial.
	var fi = context.lookupPartialByName(partialName); 
	//if (!fi)
	//	l.logd("No auto partial for " + name)

	var renderer = plugin_api.RENDERER_TEMPLATE_MAN;
	var fields = {
		title: name.replace(reNonName, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); }), // Camel Case
		layout: single_list ? 'list.html' : 'keyed_list.html',
		list_type: single_list ? dataname : dataname+'.*',
		//list_len: 100,
		list_hide_content: !fi,
		content: !fi ? '.' : "{{> " + partialName + " }}",
		dynamic_list: _field_dynamic_list,
	};	
	fields = _.extend({}, default_fields || {}, fields);

	if (fi && l.If(fi)) { 
		l.logdIf(fi, 1, "Fields for new file:\n" + l.dump(fields))
		l.logdIf(fi, 1, "Data for new file:\n" + l.dump(context.fields))
	}
	if (l.If(fileInfo)) l.logdIf(fileInfo, 1, "Fields for new file:\n" + l.dump(fields))

	filename = path.join(path.dirname(filename), path.basename(filename, path.extname(filename))+'.'+_config.DEF_EXTENSION);
	l.vlog("Adding virtual file: '"+filename+"'...")
	return context.addVirtualFile(fields, filename, renderer);
}


function _collateData(fields, options, fileInfo, context) {
	// the job of this is to group together files by certain parameters
	// 

	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't collate building blocks!
		return;

	var post_type = fields.post_type;
	if (!options.post_types[post_type] && !fields.collate) 
		// not a post type we're interested in
		return; 

	if (!!fields['draft'])
		 // don't collate for unpublished, or draft versions
		return;

	// the filename is the data element we save on each item
	var data = fileInfo.relPath;

	// where to save the data. By default is 'all' in fields. hence everything is accessed via: 'all.blog' from templates
	var _root_dest = context.fields;
	var dest = _base(_root_dest, options, 'post_types', post_type, []);
	var as = _as(options, 'post_types', post_type);
	var data_name;
	var root_default_fields = _default_fields(options, 'post_types', post_type) || {};
	var default_fields = root_default_fields;
	dest.push(data);
	if (_should_make_html(options,'post_types', post_type )) {
		data_name = _data_name(options, 'post_types', post_type);
		l.logdIf(fileInfo, 1, 'data_name=' + data_name)
		_addOutputFile(data_name, as, true, context, fileInfo, default_fields); // eg. articles.html	
	}

	for (var fieldname in options.fields) {
		if (!fields[fieldname]) {
			l.logdIf(fileInfo, 1, "no " + fieldname + " for '" + data + "'")
			continue; // nothing here to grab
		}

		var fieldInf = options.fields[fieldname];
		var gen_html = _should_make_html(options, 'fields', fieldname );
		data_name = _data_name(options, 'fields', fieldname);
		as = _as(options, 'fields', fieldname);
		default_fields = _.extend({}, root_default_fields, _default_fields(options, 'fields', fieldname))

		if (fieldInf.type === 'list') {
			dest = _base(_root_dest, options, 'fields', fieldname, []);
			l.logdIf(fileInfo, 1, data_name +' is a list')
			dest.push(data);
			if (gen_html)
				_addOutputFile(data_name, as, true, context, fileInfo, default_fields); // eg. featured.html
			// all done for simple boolean types (eg featured, popular)
			continue; 
		}

		// put the data in a sub-object
		dest = _base(_root_dest, options, 'fields', fieldname, {});

		if (gen_html)
			_addOutputFile(data_name, as, false, context, fileInfo, default_fields); // add output file for the container file (eg categories.html)

		// split tags (eg, 'tag1, tag2') into an array & collate each one
		var values = _.toRealArray(fields[fieldname], ',');
		//l.log(data_name +' is keyvalue: ' + values)
		values.forEach(function(value) {
			value = value.toString().trim(); // replace(/^\s*/,'').replace(/\s*$/,'');
			if (!value.length)
				return;
			if (!dest[value])
				dest[value] = [];
			dest[value].push(data);
			//if (gen_html)
			//	_addOutputFile(data_name+'.'+value, as+'-'+value, true, context, fileInfo, default_fields); // add output file (eg categories-some-category.html)
		})
	}


	if (l.If(fileInfo)) l.logdIf(fileInfo, 2, "Collated data is:\n"+l.dump(_root_dest))
	//l.logd("Collated data is:\n"+l.dump(_root_dest))

}


function hasProperty(obj, propName) { return obj != null && typeof obj === 'object' && (propName in obj); }
function _valueToKeyValues(context) {
	var values = [];
	for (var key in context)
		values.push({key:key, value: context[key]})
	return values;
}
function _findValue(_name, _root_context) { // this has been lifted from usematch.js:723
    var name, names, value, context = _root_context;

    name = _name; // eg. post.item.title or post.item.*
    names = name.split('.')

	while (context && names.length) {
		if (!hasProperty(context, name)) {  // look for 'post.item.title' as a field
			// nope. 
			if (names[0]==='*' && !hasProperty(context, names[0])) {  // look for '*' as a field
				// have *, but not as a field
				// convert the current context to key/value pairs & keep searching
				context = _valueToKeyValues(context)
				if (names.length===1)
					value = context; // this is the last item. This is what we were looking for.
			}
			else
			{
				//look for 'item.title' in 'post'
				context = context[names[0]]
			}
			names.splice(0,1)
			name = names.join('.')
		}
		else {
			value = context[name];
			context = null; // stop iterating! (NB: value might be forcibly 'undefined' or 'null', so can't test for value)
		}
	}

    return value;
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

3. The theme/user then has defined the 'list.html' layout as:
		{{#dynamic_list}} ... {{/dynamic_list}}

4. The system then ends up at the 'dynamic_list' function (here), which returns the array given: 
	eg. return this['post'], which comes from elsewhere step 1.


Why? This allows a theme to make theme-centric lists of posts/authors, tags, etc, and 
	frees up the user from worrying about such things, when changing themes
*/
	var data = _findValue(this.list_type || 'page', this);

	if (!data) {
		l.logw("dynamic list_type '" + this.list_type + "' did NOT find data!")
		//l.vvlogd("Data set is:\n" + l.dump(this))
		return [];
	}
	return data.slice(0, this.list_len || 999);

	/*
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
	*/
}

// the main entry point for the plugin
function _render(text, fields, fileInfo, context) 
{
	var options = _.extend({}, default_options, this.plugin_options);
	if (options.disable === true)
		return text;
	//l.vvlogd(l.dump(options));

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
/*	var options = _.extend({}, default_options, this.plugin_options);
	if (options.disable === true)
		return true;


	var p = null;
	var lists = {};
	for (var name in options) {
		var fieldInf = options[name];
		if (!fieldInf)
			continue; // user probably blanked something out.
		if (fieldInf.generate_html!==false)
			_addOutputFile(name, fieldInf.filename, fieldInf.single_list, context)
	}*/

	return true;
}

