/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* This is the public api for 'view'
* Returns a Promise
*
* Not sure if this should be in core...But since it's convenient, here it is.
*/
"use strict";

var l  = require('ergo-utils').log.module('ergo-api-view');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');

module.exports = function(options) {
	return Promise.try(function() {
		options = options || {};

		var config = require('./config').getConfigSync(options.working_dir, options);
	
	});
}