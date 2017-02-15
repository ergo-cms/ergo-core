
/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/

/*
* A set of helper functions for syncing
*/

var l = require('ergo-utils').log.module('ergo-sync-helper');
var _ = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var Promise = require('bluebird');
const ignore = require('ignore');

var _walk = require('../lib/walk');

"stat,readFile,writeFile,utimes".split(',').forEach(function(fn) {
	fs[fn] = Promise.promisify(fs[fn])
});

var API = module.exports = {
	__UNKNOWN: -100,
	DOWNLOAD: -1,
	IGNORE: 0,
	UPLOAD: 1,
	REMOVE_REMOTE: 2,
	REMOVE_LOCAL: 3,
	SYNC_FILE: '.ergo.sync',
	//TIME_DRIFT: 30000, // max allowable 'drift' in time

	lastSync: _lastSync,
	setSynced: _setSynced,
	loadLocal: _loadLocal,
	determineSync: _determineSync,
	toUnixFileTime:_toUnixFileTime
};
var isDate = require('util').isDate;

function _toUnixFileTime(time) {
  if (typeof time === 'number' && !isNaN(time))
    return time;
  else if (isDate(time))
    return parseInt(time.getTime() / 1000, 10);
  throw new Error('Cannot parse time: ' + time);
}

function _lastSync(dir) {
	return Promise.coroutine(function *() {
		var sync_file = path.join(dir,API.SYNC_FILE);
		try {
			var stats = yield fs.stat(sync_file);
			return _toUnixFileTime(stats.mtime);
		}
		catch(e) {
			
		}
		return -1;
	})();
}


function _setSynced(dir, mtime) {
	return Promise.coroutine(function *() {
		mtime = mtime || _toUnixFileTime(new Date());
		var sync_file = path.join(dir, API.SYNC_FILE);
		try {
			//yield fs.unlink(sync_file); // remove old file
		}
		catch(e) {
			//ignore unlink errors
		}
		yield fs.writeFile(sync_file, mtime.toString(), 'utf8');
		yield fs.utimes(sync_file, mtime, mtime);
		return _lastSync(dir);
	})();
}

function _loadLocal(dir, options) {
	return Promise.coroutine(function *() {
		var lastSync = yield _lastSync(dir);

		var list = [];
		var lastFile = -1;
		var fn = function(item) {
			if (lastFile==-1 || lastFile<item.stats.mtime)
				lastFile = item.stats.mtime;
			//l.log("local " + item.path)
			list.push({
				path:path.relative(dir, item.path), 
				stats:{
					atime:_toUnixFileTime(item.stats.atime),
					mtime:_toUnixFileTime(item.stats.mtime)}} ) // {path, stats}.
		}

		//if (options.direction!=API.DOWNLOAD) // no point traversing local files if just downloading?
		yield _walk(dir, fn, {ignore: options.ignore});

		return {
				dir:dir, 
				items:list,
				lastFileTime:_toUnixFileTime(lastFile),
				lastSyncTime:_toUnixFileTime(lastSync)};
	})();
}

function _determineSync(local, remoteFile, remoteStats, remoteLastSync, options) {
	options.timeDrift = options.timeDrift || 5; // 5 secs
	var file = remoteFile.replace(/\//g, path.sep); // convert to local fs path seps
	var stats = undefined;
	var action = API.__UNKNOWN;
	
	var uploadOnly = options.direction == API.UPLOAD;
	var downloadOnly = options.direction == API.DOWNLOAD;
	var syncOnly = !options.direction;

	for (var i=0; i<local.items.length; i++) {
		var item = local.items[i];
		if (item.path == file) {
			// found both local and remote files
			if (!!remoteStats) {
				var difftime = item.stats.mtime - remoteStats.mtime;
				//l.vlog('difftime = ' + difftime + ' ('+item.stats.mtime+' - '+remoteStats.mtime+')')
				if (Math.abs(difftime)<options.timeDrift)  
					// same file. nothing changed
					action = API.IGNORE;
				else if (difftime < 0) // remote is newer
					action = uploadOnly ? API.UPLOAD : API.DOWNLOAD;
				else // difftime>0 . local is newer 
					action = downloadOnly ? API.DOWNLOAD : API.UPLOAD;
			}
			else {
				// don't have remote stats. must be a new local file
				action = downloadOnly ? API.IGNORE : API.UPLOAD;
				var difftime = local.lastSyncTime - remoteLastSync;
				if (difftime<-options.timeDrift && syncOnly) {
					// remote has been synced with someone else. The remote file is missing, but local is here.
					l.vlog('missing remote diff = ' + difftime + ' ('+item.stats.mtime+' - '+local.lastSyncTime+')')
					if (item.stats.mtime<local.lastSyncTime)
						// NOT. A new file
						action = API.REMOVE_LOCAL;
				}
			}

			//item.action = action; // record what action we took
			stats = item.stats;
			item.action = action;
			local.items.splice(i, 1); // remove the file from being acted upon again. ie mark as handled
			break;
		}
	}
	if (action==API.__UNKNOWN) {
		// remoteFile not found in local files
		var difftime = local.lastSyncTime - Math.max(remoteLastSync,remoteStats.mtime);
		l.vlog('local file missing difftime = ' + difftime + ' ('+local.lastSyncTime+' - '+remoteStats.mtime+')')
		if (difftime<-options.timeDrift && !uploadOnly || downloadOnly) {
			// a newish file. download it
			action = API.DOWNLOAD;
		} else {
			// an older file that we had obviously known about. remove it
			action = API.REMOVE_REMOTE;
		}
	}

	if (file == API.SYNC_FILE)
	{ // never transfer these
		action = API.IGNORE;
	}
	return {
		action:action,
		localFile: path.join(local.dir,file),
		localStats:stats
	}
}


