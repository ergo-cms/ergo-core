/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";

var l  = require('ergo-utils').log.module('ergo-plugins-simpletag');
var _  = require('ergo-utils')._;
var path = require('path');

var json_parse = require('../not_json').parse;
var plugin = require('../../api/plugin');
//l.color = l._colors.FgGreen;

var renderer = plugin.addRenderer(plugin.RENDERER_TAG, { // name MUST match the filename
  	  extensions: "tem,tpl"
  	, renderFn: _renderMain
	, calcExtensionFn: _calcExtension
}).addPreRenderer(plugin.RENDERER_HEADER_READ);

var default_options = {
	  tag_start: "{"
	, tag_end: "}"
	, block_start: "begin:{name}" // NB: the {name} here is independent to the above tag start/stop
	, block_end:   "end:{name}"
	, if_start: "if:{name}"
	, not_if_start: "!:{name}"
	, if_else: "else"
	, if_end: "end" // can cause issues if same as block_end, or nested! so dont!
	, include: "include:{name}" // name is any partial

	// call out to a plugin start, stop?
	// could be *very* useful. The 'content' is passed to the plugin's render method. 
	//		Would probably need to skip pre/post render
	// plugin_start: "plugin:{name}"
	// plugin_end: "/plugin:{name}"
	// eg. a 'javascript renderer' could eval the following: (& allow all sorts of nasties!)
	/*
	{plugin:js}titleCase({foo});{/plugin:js}
	*/
};

/*
This is all rather dodgey stuff. A proper implemtation would be an AST style parser.

(This was largely copied from an old (personal) js project, which came from an even older c++ project)
*/


function _calcExtension(filename, currentExt) {
	// simply return the rightmost extension
	var ext = filename.split('.').slice(-1);
	if (ext=='tem' || ext=='html')
		// revert to html if no better option.
		// The html check is here to rename 'tem.html' to '.hubla' if 'hubla' has been set as the new default extension
		return plugin.DEF_EXTENSION;
	return ext;
}

function ReBuilder(options, params) {
	this.options = _.extend({}, options, params||{escape:true});
	this.sections =  [];
	this.re = null;
	this.numParams = 0;
	//this.inf = optional_inf;
}

ReBuilder.prototype.push = function(exact) { // just push exact bit of string
	this.sections.push(exact);
	return this; // chain ourselves
};

ReBuilder.prototype.addEsc = function(str, force) { // escapes things
	if (this.options.escape || force)
		str = str.replace(/(\W)/g, "\\$1"); // put an escape (\) in front of any symbol-esque chars.
	return this.push(str);
};

ReBuilder.prototype.add = function(str, name, has_params) { // makes {name} or {name (.*?)} -ish
	this.push(this.options.tag_start)
		.addEsc(str.replace('{name}', name||''));
	if (!!has_params) {
		this.numParams++;
		this.push("\\s*(?:\\s+(.+?)\\s*)?");
	}
	return this.push(this.options.tag_end);
};

ReBuilder.prototype.addCaptureParams = function(str, name) { // makes {name (.*?)} - ish
	return this.add(str, name, true);
};

ReBuilder.prototype.addMultiCapture = function() {
	this.numParams++;
	return this.push('([\\s\\S]*?)');
};

ReBuilder.prototype.addCapture = function() {
	this.numParams++;
	return this.push('(.*?)');
};

ReBuilder.prototype.addBlock = function(name) { // makes: {begin:name} .... {end:name} , where .... == .*? -ish
	return this.addCaptureParams(this.options.block_start, name)
		.addMultiCapture()
		.add(this.options.block_end, name)
};

ReBuilder.prototype.addIfElseBlock = function(ifElseNotIf, name) { // makes: {if:name} .... (?:{else} ....)? {end} , where .... == .*? -ish
	return this.add(ifElseNotIf ? this.options.if_start : this.options.not_if_start, name)
		.addMultiCapture()
		.push('(?:')
		.add(this.options.if_else, name)
		.addMultiCapture()
		.push(')?')
		.add(this.options.if_end, name)
};

ReBuilder.prototype.build = function() {
	if (!this.re) {
		//if (!!this.inf)
		//	lif(this.inf, 2, 'building re: ' +this.sections.join(''));
		if (this.options.debug)
			l.logd('building re: ' +this.sections.join(''));

		this.re = new RegExp(this.sections.join(''), 'gi')
	}
	return this.re;
};

ReBuilder.prototype.exec = function(str, valueOrFn) {
	return str.replace(this.build(), valueOrFn);
};

// this doesn't actually 'make'... but starts it off. Ends when .build() .or .exec(str, function()/value) called
function _makeRe(options, params) { return new ReBuilder(options, params); }


var _strIndent = '';
function lif(inf, level, str) { // a logger. reads config file & determines what to output
	l.logdIf(inf.fileInfo, level, _strIndent.substr(1)+str)
}
function pushIndent() {
	_strIndent += '\t';
}
function popIndent() {
	_strIndent = _strIndent.substr(0, _strIndent.length-1);
}

function _paramsToObj(params, inf, filename) {
	try {
		return json_parse('{'+(params||'')+'}');
	}
	catch(e) {
		l.loge("Error in '"+filename+"': " + _.niceStackTrace(e));
		return {};
	}
}

function encodeHTML(s) 
{
    return s.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;');
}

function _paramsMakeFilterInf(params, filename)
{
	if (params.escape) {
		l.logd("Making escapeHTML filter for '"+filename+"'")
		return { encode: [encodeHTML] }
	}
	if (params.encode) {
		// this:
		// converts:             'encodeHTML|String.prototype.toUpperCase'
		// to [function]:         [ encodeHTML, String.prototype.toUpperCase ]
		try {
			l.logd("Making encoder filter for '"+filename+"'")
			var ar = _.toRealArray(params.encode, '|').map(eval)
			l.log(l.dump(ar));
			return {encode:ar};
		}
		catch(e) {
			l.logw("Could not encode: '" +params.encode + "' when rendering '"+filename +"': " + _.niceStackTrace(e));
			throw e;
		}
	}
	return {};
}

function __applyFilter(text, filterInf) {
	if (!filterInf || !_.isString(text))
		return text;
	if (filterInf.encode) {
		l.logd("Applying filter to: "+text)
		var t =  filterInf.encode.reduce(function(value, filterFn, param3) {
			l.logd(l.dump(value) + "," + l.dump(filterFn) + ", " + l.dump(param3))
			return filterFn(value);
		}, text)
		l.logd("Filtered text is: " +t)
		return t;
	}
	return text;
}
function __renderFields(text, fields, filterInf, inf) {
	var o = inf.options;
	lif(inf, 1, '__renderFields')

	for(var key in fields) {
		if (key=='content' && inf.disallow_content_field) {
			continue;
		}

		var value = fields[key];
		lif(inf, 2, "   " + key + ": " + (_.isString(value) ? value.substr(0,300) : value));
		var not = !value || _.isEmptyString(value);


		// handle {!if:field} {else} {end} block
		text = _makeRe(o)
			.addIfElseBlock(false, key)
			.exec(text, function(match,p1,p2,offset) {
					lif(inf,0, "renderFields !if match: " + l.dump([match.substr(0,300),p1.substr(0,300),p2,offset]) )
					var new_text = not ? p1 : (p2 || '');
					return _render(new_text, fields, filterInf, inf);
				});

		// handle {if:field} {else} {end} block
		text = _makeRe(o)
			.addIfElseBlock(true, key)
			.exec(text, function(match,p1,p2,offset) {
					lif(inf,0, "renderFields if match: " + l.dump([match.substr(0,300),p1.substr(0,300),p2,offset]) )
					var new_text = (!not) ? p1 : (p2 || '');
					return _render(new_text, fields, filterInf, inf);
				});

		// handle {field}
		text = _makeRe(o)
				.add(key, '')
				.exec(text, __applyFilter(value, filterInf));
	}
	lif(inf, 3, "__renderFields final: "+text.substr(0,100));
	return text;
}


function __renderBlockList(list, template, defaultFields, filterInf, inf) { //text, params, list, filterInf, inf) {
	lif(inf, 0, '__renderBlockList')
	var texts = [];
	list.forEach(function(relPath) {
		var fi = inf.context.getFileInfoByRelPath(relPath);
		var fields = fi.fields;
		lif(inf, 2, "File info for '"+relPath+"' : " + l.dump(fi))
		//l.vvlog("replaceBLockList field: "+l.dump(fields).substr(0,300));
		texts.push(_render(template, _.extend({}, defaultFields, fields), filterInf, inf));
	})
	//l.vvlogd("replaceBlockList: " + texts.join(""))
	lif(inf, 1, '__renderBlockList done')
	return texts.join("");
}

function __renderBlock(text, block_name, block_list, defaultFields, filterInf, inf) 
{
	// NB: a block_list is an array of filenames.

	lif(inf, 0, '__renderBlock(' + block_name +')')

	text = _makeRe(inf.options)
			.addBlock(block_name)
			.exec(text, function(match,p1,p2,offset) {
					lif(inf, 1, "renderBlock matches: " + l.dump([match.substr(0,300),p1,p2.substr(0,300),offset]) )
					// NB: the first capture is params, the 2nd is the block contents/text.

					p1 = _paramsToObj(p1, block_name);
					filterInf = _paramsMakeFilterInf(p1, block_name);
					lif(inf, 0, "Rendering block list '"+block_name+"' " + l.dump(p1) + "..."); 
					// merge the params (p1) in as lowest priority for the fields.
					var new_defaultFields = _.extend({}, p1, defaultFields);
					var block = __renderBlockList(block_list, p2, new_defaultFields, filterInf, inf);
					//block = _renderUnusedFields(block, inf);
					lif(inf, 2, "renderBlock is: " + block.substr(0,1000))
					return block;
				})
	//l.vvlogd("\n\n\n\nrenderBlock (final): '"+inf.fileInfo.relPath+"' :" + text.substr(0,500))
	lif(inf, 2, '__renderBlock(' + block_name +') done')
	return text;

}



function _renderBlocks(text, fields, filterInf, inf)
{
	lif(inf, 0, '_renderBlocks')
	var prev_disallow = inf.disallow_content_field;
	inf.disallow_content_field = false;

	// search for blocks {begin:XXX} and {end:XXX}

	var blocks = { }
	// walk the global fields and generate a 'flatter' list of block elements
	// NB: give preference to article_type when name conflicts occur
	for (var key in inf.gfields) {
		// key is eg. post_type, tags, or category
		var is_post_type = key=='post_type';

		for (var key2 in inf.gfields[key]) {
			// key2 is eg. 'article', 'blog', or category 'some_category'
			if (blocks[key2] && !is_post_type || !blocks[key2])
				blocks[key2] = inf.gfields[key][key2]
		}
	}

	for (var block_type in blocks)
	{
		text = __renderBlock(text, block_type, blocks[block_type], {}, filterInf, inf); // DON'T use any existing fields. Each block must be self-sufficient & isolated from parent
	}
	
	inf.disallow_content_field = prev_disallow;
	lif(inf, 2, '_renderBlocks done')
	return text;
}

function _renderIncludes(text, fields, filterInf, inf) {
	var o = inf.options;
	lif(inf, 0, '_renderIncludes')

	// snippets and includes get the same treatment here:
	var partials = inf.context.partials;
	for (var name in partials) {
		var partial = partials[name];

		// search for 'snippet.tex' as well as 'snippet'
		[name,path.basename(name, path.extname(name))].forEach(function(_name) {
			l.vlogd('testing '+o.include+' for '+_name)
			text = _makeRe(o)
				.addCaptureParams(o.include, _name)
				.exec(text, function(match, p1) {
						// found an include, see if there are params included:
						p1 = _paramsToObj(p1, inf, inf.fileInfo.relPath + "'' for '" + _name);
						var new_filterInf = _paramsMakeFilterInf(p1, _name);

						lif(inf, 0, "Including '"+name+"'... " + l.dump(p1))
						var new_fields = _.extend({},p1,fields)
						var new_text = partial.fields.content;
						new_text =  _render(new_text, new_fields, new_filterInf, inf);
						lif(inf, 1, "Including '"+name+"' done")
						return new_text
					})
		})
	}
	lif(inf, 1, '_renderIncludes done')
	return text;
}

function _renderUnusedFields(text, inf)
{
	lif(inf, 1, '_renderUnusedFields')
	var o = inf.options;
	// TODO ignoring style & script blocks, remove all { }
	const wild_name = '.*?';

	// handle {if:.*?} .... {else} .... {end}, replacing with the 2nd ....
	text = _makeRe(o, {escape:false})
			.addIfElseBlock(true, wild_name)
			.exec(text, function(match, p1, p2) {// the 'else' is obviously true
				return p2 || '';
			}); 

	// handle {!:.*?} .... {else} .... {end}, replacing with the 1st ....
	text = _makeRe(o, {escape:false})
			.addIfElseBlock(false, wild_name)
			.exec(text, '$1'); // the non-'else' is obviously true

	// handle {include:.*?} 
	text = _makeRe(o, {escape:false})
			.add(o.include, '.*?')
			.exec(text, ''); 

	// get rid of {begin:block}  .... {end:block}
	text = _makeRe(o, {escape:false})
			.addBlock('.*?') // ONLY match non-spacing fields. ie. doesn't match: { field} or {field }, but does match {field}
			.exec(text, '');

	// get rid of {field}
	text = _makeRe(o, {escape:false})
			.add('[^\\s]*?') // ONLY match non-spacing fields. ie. doesn't match: { field} or {field }, but does match {field}
			.exec(text, '');


/*	// fields matching {begin:someblock}\n\nSome Text{endb}
	// returns ''
	text = text.replace(/{begin:.*?}.*?{endb}/g, "");
	text = text.replace(/{list:.*?}.*?{endl}/g, "");
	text = text.replace(/{if\:.*?}.*?{end}/g, "");
	text = text.replace(/{\!\:.*?}.*?{end}/g, IfnFields_match);
	var _scriptMatches = MatchBlock(text, "<script", "</script>");
	var _styleMatches = MatchBlock(text, "<style", "</style>");
	var _ignoreBlocks = _scriptMatches.concat(_styleMatches);
	var _unusedBlocks = MatchBlock(text, "{", "}", _ignoreBlocks);
	for (var i=_unusedBlocks.length-1; i>=0; i--)
	{
		// returns "", unless 'somekey' is in config file
		var b = _unusedBlocks[i];
		var field = text.substr(b.index+1, b.length - 1);
		var value = _config.default_fields[field] || "";
		text = text.slice(0,b.index) + value + text.slice(b.index+b.length+1);
	}
*/
	return text;
}




function _render(text, fields, filterInf, inf) {
	//l.vvlogd("render fields: " + l.dump(inf.fields).substr(0,300));
	pushIndent();
	lif(inf, 2, 'Rendering: '+text.substr(0,1000))
	text = _renderIncludes(text, fields, filterInf, inf);
	text = _renderBlocks(text, fields, filterInf, inf);
	text = __renderFields(text, fields, filterInf, inf);
	//text = __renderFields(text, inf.gfields, filterInf, inf);
	text = _renderUnusedFields(text, inf);// always keep this as the last thing to do
	popIndent();
/*
	//var text = values["content"];
	text = renderBlocks(text);

	text = ProcessIncludes(text, values);
	text = processSimpleFields(text, values);
	text = ProcessSnippets(text);
	text = ProcessUnusedFields(text);// always keep this as the last thing to do
*/
	return text;

}

/*
The data structures:

fields are a simple list/map: 
  "content": "<p>This is a standard About page.</p>",
  "date": "2012-2-11 8:27",
  "title": "About the Demo Site",
  "metadesc": "About the ergo-cms skeleton demo site",
  "metakeys": "about",
  "extracss": "aboutpage",
  "tags": "freedom,about",
  "site_url": "http://demosite.example.com",
  "author": "Demo Author",
  "date.day": "11",
  "date.month": "Feb",
  ...
  "date.atom": "2012-02-10T21:27:00.000Z",
  "post_type": "article",
  "_template": "{include:header.inc.html}\n{content}\n{include:footer.inc.html}\n",
  "item_template": "articleentry.tem.html"




context.fields are NOT flat (but see how we flatten them in _renderBlocks()):
{
  "post_type": {
    "article": [
    	'about.tex'
    ],
    "blog": [
    	'blog/a first post.md'
    	, 'blog/a second post.tex'
    ]
  },
  "tags": {
    "freedom": [  // same as above: it's the list of filenames
    	'about.tex'
    	, 'blog/a first post.md'
    ],
    "about": [
    	'about.tex'
    ]
  }
}


*/


// When making a mustache plugin, the only thing really needed is similar functionality as this function:
// 		- Use fields._template as a source, if available, otherwise use fields.content (aka text parameter)
// 		- merge fields here with those in context.fields (in a non-desctructive manner)
function _renderMain(text, _fields, fileInfo, context) 
{ 
	if (fileInfo.isLayout || fileInfo.isPartial)
		// don't tag building blocks, they're done when they're included/snippeted,
		// as their content may change depending upon the file being included into.
		return text;

	var options = _.extend({}, default_options, this.plugin_options);

	// might be just a sitemap or similar
	var fields = _.extend({}, context.config.default_fields, _fields);

	var inf = { // *THIS* is the meta info we pass around as a parameter in the above functions
		  fields:fields
		, gfields:context.fields
		, fileInfo:fileInfo
		, options:options
		, context:context
	}


	// there are two paths:
	var templated = !!fields.template_content;
	if (templated) {
		lif(inf,0, "Detagging '"+fileInfo.relPath+"' using template field");
		text = fields.template_content;
	}
	else {
		lif(inf,0, "Detagging '"+fileInfo.relPath+"' using content field");
		inf.disallow_content_field = true; // whatever we do, if we see a '{content}' field. don't touch it! else we become recursive!
	}
	lif(inf,1, "Content is: " + text.substr(0,1000))

	text = _render(text, inf.fields, {}, inf)
	lif(inf, 2, "Final "+(templated?"(templated) ":"") +"text: \n" + l._colors.FgGreen + text.substr(0,1000) + l._colors.Reset);

	if (templated)
		_fields.template_content = text;
	else
		_fields.content = text;
	return _fields.content; // make sure we return the CONTENT, not necessarily the templated text we've calculated here. 
}




