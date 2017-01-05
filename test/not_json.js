


var parse = require('../lib/not_json').parse;


describe('Checks not_json parser for security', function() {

	var checks = [
	  { str: "{ evil1: \"eval (harry)\" }", isOK:false }
	, { str: "{ evil2: \"eval(harry)\" }", isOK:false }
	, { str: "{ not_evil2: \"_eval('asd','not')\" }", isOK:true }
	, { str: "{ not_evil3: \"eval_(monkey)\" }", isOK:true }
	, { str: "{ not_evil4: \"eval$(asd)\"  }", isOK:true }
	, { str: "{ js_evil1: \"javascript:alert('I got here!')\" }", isOK:false }
	, { str: "{ fn_not_evil1:'func()' }", isOK:true }
	, { str: "{ function: new Date() + \" I am not evil\" }", isOK:true } // yes, there's nothing wrong with this, really
	, { str: "{ fn_evil1: (function() { alert('I am evil'); })() }", isOK:false }
	, { str: "{ fn_evil2: \"function named123 () {}\" }", isOK:false }
	, { str: "{ fn_evil3: \"function _nam123() { alert('oi'); }\" }", isOK:false }
	, { str: "{ fn_not_evil3: \"function _nam123.dotted () {}\" }", isOK:true }
	, { str: "{ fn_not_evil4: \"function_nam123 () {}\" }", isOK:true }
	]
	checks.forEach(function(obj, idx){
		it("Check #"+(idx+1)+": '" + obj.str + "' is ok: " + obj.isOK, function() {
			try {
				parse(obj.str)
			}
			catch(e) {
				//console.log(e.message);
				assert.isFalse(obj.isOK)
				return;
			}
			assert.isTrue(obj.isOK); // should parse OK
		})

	});
});
