/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/


/*
Lacking knowledge of a good, but forgiving JSON parser, this hacklet was created. 
In short, I want to use JS Objects, but without it being strict JSON.

What is no good about the std JSON:
- trailing commas definitely break it
	- How annoying is that????
- comments can break it
	- How daft is that????
- the *key* MUST be in quotes. eg "key":"value"
	- How daft is that????

In short, anything that acceptable to *real* JS object should be acceptable here. I declare that this *should* be allowed:
	key: "A string" + "another string"
	key: (new Date()) + " Some Date"
	key: (function() { return "green eggs and ham";})()    <-- Although I think it OK, the parser disallows this use

This parser does 1 thing: look for a few keywords that can be unsafe: notably 'eval' & function ()
it's assumed that in context of a CMS, then everything else is acceptable. That is, the following are ok:
- <script>
- JSON.parse ....which is inherently safe anyway ;)

However, things may change to cause this to be 'locked' down more.
*/

var re_baddies = /(?:\beval\s*\(|\bjavascript\:|\bfunction\s+\w+\s*\(|\bfunction\s*\()/
	// \beval\s*\(  == search for 'eval(', 'eval ('
	// \bjavascript:\(  == search for 'javascript:'
	// \bfunction\s*\w*\( == search for 'function(', 'function word_1 (', etc' 

function _parse(str) {
	if (re_baddies.test(str))
		throw new SyntaxError('Bad syntax. Probable attempt at injecting javascript');
	return eval("(function(){return " + str + ";})()");
}


module.exports = {
	  parse: _parse,
};


/* Here are some tests: (also look in tests). Note: this is ALL malformed & won't eval, for other reasons

{ evil1:eval (harry),
evel2: eval(harry
notevil2_eval(asd
notevil3:eval_(monkey
notevil4:eval$(asd
js_evil1:javascript:alert(
fn_notevil1:func()
function:fn_notevil2
fn_evil1:function() { }
fn_evil2: function named123 ( 
fn_evil3: function _nam123( 
fn_notevil3: function _nam123.dotted ( 
fn_notevil4: function_nam123 ( 



*/

