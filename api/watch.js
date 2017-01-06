/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
"use strict";
var l  = require('ergo-utils').log.module('ergo-api-watch');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path')
var build_api = require('./build');
var Promise = require('bluebird')


var _watcher = null;

function _rebuild(options, context) {
	l.vlog("Changes detected. Rebuilding...");
	var execFile = Promise.promisify(require('child_process').execFile);

	var cmd = process.argv.slice(0,1).join(''); // this is the node command that was used to execute us (HOPEFULLY)
	var args = [
		process.argv.slice(1, 2).join(''), // this is the location of ergo-cli that was run
		'build', 
		'--working_dir='+options.working_dir];
		
	l.vvlog("Running '"+cmd+"' with args: " + l.dump(args))
	return execFile(cmd, args)					
		.catch(function(err) {
			l.loge("Error when building:\n" + _.niceStackTrace(err));
			return false;
		})
		.then(function(response) {
			if (!response) {
				return false; // from previous catch()
			}

/*
  			if (response.stderr && response.stderr.length>0) 
  				l.loge("Error converting '"+_src+"': "+ response.stderr); // BUT DONT throw an error & allow continuation

  			if (!fileExists(_dst)) {
				l.logw("Output is empty for '"+_dst+"'. Please check '"+_src+"'");
				return false; // didn't create output file!
  			}
*/
  			l.log("Build complete " + response);
  			return true;
  		});

	/*
	return build_api(options)
	.then(function(result) {
		l.vlog("Build complete: " + result);
		return true;
	})
	.catch(function(err) {
		l.loge("Error when building:\n" + _.niceStackTrace(err));
		return false;
	})*/
}

function _watch(options, context) {
	if (!!_watcher)
		return _watcher;

	options.watch_dir = options.watch_dir || context.getSourcePath(); // undocumented. only a dev might want this... probably
	options.watch_delay = options.watch_delay || 300;
	var fswatch_options = {
		  persistent: options.persistent || true // default is: true
		, recursive: true
		// default is :, encoding: 'utf8'
	};
	var build_options = {
		working_dir: context.getBasePath()
	};

	var _changeTimeout = null;
	var _changesWaiting = 0;
	var _buildPromise = null;

	var _rebuildTimerCallback = function() {
		_changeTimeout = null;

		if (!!_buildPromise) {
			// too soon! We haven't finished the previous build and these changes may (or may not) be included.
			// We need to back off for a while...
			_changesWaiting++;
			l.vvlog("Still building. Added to delayed build request.")
		}
		else
		{
			_changesWaiting = 0;
			_buildPromise = _rebuild(build_options, context)
				.then(function() {
					_buildPromise = null;
					if (_changesWaiting) {
						l.vlog("Re-invoking delayed build request.")
						_changeTimeout = setTimeout(_rebuildTimerCallback, options.watch_delay*5);
					}
				});
		}


	}

	options.watch_dir = path.resolve(options.watch_dir);
	l.log("Starting watch on: " + options.watch_dir);
	_watcher = fs.watch(options.watch_dir, fswatch_options, function(eventType, filename) {
		filename = path.resolve(options.watch_dir, filename);
		// ignore the params themselves, except to log some information about the change:
		if (fs.isInDir(context.getOutPath(), filename)) {
			l.vlog("Ignoring changes for '" + filename + "'");
			return;
		}
		l.vlog(eventType + ": '"+ filename + "'");

		// 
		// do a 'lazy' reload. That is, keep delaying a build until 'n' millisecs of silence
		// from this callback
		if (_changeTimeout) 
			clearTimeout(_changeTimeout);
		_changeTimeout = setTimeout(_rebuildTimerCallback, options.watch_delay);

	})

	return _watcher;
}

 module.exports = function(options) {
	return Promise.try(function() {
		options = options || {};

		var context = require('./config').getContextSync(options.working_dir);
		context.mergeRuntimeOptions(options);
		return _watch(options, context);
	});
};
module.exports._watch = _watch;

