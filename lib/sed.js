/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
sed is Single line editor of files. 
*/

var fs = require('fs');

var Promise = require('bluebird');
// promisify a few funcs we need
"readFile,writeFile".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

function _sedP(file, search, replace) {
return Promise.coroutine(function *() {
	var retVal = false;
	var data = (yield fs.readFile(file, 'utf8')).toString();
	data = data.replace(search, function() { 
		retVal = true;
		return replace; });
	yield fs.writeFile(file, data, 'utf8')
	return retVal;
})();
}

module.exports = { 
	sedP: _sedP // the 'P' is a promise ;)
}