
/**
 * @license MIT
 * Copyright (c) 2016 Craig Monro (cmroanirgo)
 **/
 "use strict";

/*
* This is the ssh2 implementation file for 'sync'
*/
var l  = require('ergo-utils').log;//.module('ergo-sync-ssh');
var _  = require('ergo-utils')._;
var fs = require('ergo-utils').fs.extend(require('fs-extra'));
var path = require('path');
var posix = path.posix;
var Promise = require('bluebird');
var sync_helper =  require('./sync-helper')
const ignore = require('ignore');


// promisify a few funcs we'll use
"utimes,unlink".split(',').forEach(function(fn) {
	fs[fn+'P'] = Promise.promisify(fs[fn])
});


module.exports = _sync;

function _sync(localPath, remotePath, options) {
	if (!options || !options.connection.host || !options.connection.username)
		throw new Error("Invalid args to ssh sync");

	var Client = require('ssh2').Client;

	var connectInfo = {
	  host: 'localhost',
	  port: 22,
	  agent: process.env.SSH_AUTH_SOCK,
	  agentForward: true
	};
	var isWin = /^win/.test(process.platform);
	if (isWin)
		connectInfo.agent = "pageant";
	_.extend(connectInfo, options.connection)


	return Promise.coroutine(function *() {
		// load all the local files
		var local = yield sync_helper.loadLocal(localPath, options);

		options.timeDrift = options.timeDrift || 30; // 30secs
		var remoteModified = false;
		var lastRemoteFileTime = -1;

		function _handleFile(sftp, action, localFile, localStats, remoteFile, remoteStats) {
			return Promise.coroutine(function *() {
				switch (action) {
					case sync_helper.UPLOAD:
						l.log("Uploading " + remoteFile)
						try { 
							yield sftp.mkdirP(posix.dirname(remoteFile),0)
						}
						catch(e) { }
						remoteModified = true;
						yield sftp.fastPutP(localFile, remoteFile, {});
						yield sftp.utimesP(remoteFile, localStats.atime, localStats.mtime);
						if (lastRemoteFileTime==-1 || lastRemoteFileTime<localStats.mtime)
							lastRemoteFileTime = localStats.mtime;
						break;
					case sync_helper.DOWNLOAD:
						l.log("Downloading " + remoteFile)
						yield sftp.fastGetP(remoteFile, localFile, {});
						yield fs.utimesP(localFile, remoteStats.atime, remoteStats.mtime);
						if (lastRemoteFileTime==-1 || lastRemoteFileTime<remoteStats.mtime)
							lastRemoteFileTime = remoteStats.mtime;
						break;

					case sync_helper.REMOVE_REMOTE:
						l.log("Deleted " + remoteFile)
						remoteModified = true;
						yield sftp.unlinkP(remoteFile) 
						break;

					case sync_helper.REMOVE_LOCAL:
						l.log("Deleted local file " + path.relative(localPath,localFile));
						yield fs.unlinkP(localFile);
						break;

					default: // == case sync_helper.IGNORE
						l.vlog("Skipping " + remoteFile);
						break;
				}
			})();
		}

		// load/prep the ignore list
		var ignoreFilter = ignore().add([sync_helper.SYNC_FILE, '.git', 'node_modules']);
		if (options.ignore)
			ignoreFilter = ignoreFilter.add(_.toRealArray(options.ignore));
		ignoreFilter = ignoreFilter.createFilter();

		function _walk(sftp, lastSync, dir) {
			//l.vlog("walking remote dir: "+dir)
			return Promise.coroutine(function *() {
				var list = yield sftp.readdirP(dir);
				for (var i=0; i<list.length; i++) {
					var item = list[i];
					if (!ignoreFilter(item.filename))
						continue;
					
					var remoteFile = posix.join(dir, item.filename);
					if (item.attrs.isDirectory())
						yield _walk(sftp, lastSync, remoteFile)
					else {
						var s = sync_helper.determineSync(local, posix.relative(remotePath, remoteFile), item.attrs, lastSync, options);
						yield _handleFile(sftp, s.action, s.localFile, s.localStats, remoteFile, item.attrs)
					}
				}
				return true;
			})();
		}


		return new Promise(function(resolve, reject) {
			var conn = new Client();
			l.log("Connecting to "+connectInfo.host+"...")
			conn.on('ready', function() {
				l.log('Connected');

				var p = Promise.coroutine(function *() {
					// promisify a few funcs we'll use
					"sftp,exec".split(',').forEach(function(fn) {
						conn[fn+'P'] = Promise.promisify(conn[fn])
					});

					// get the current server time
					// & work out if we have time issues
					var serverDate;
					var stm = yield conn.execP('date -R');
					var pDate = new Promise(function(resolve, reject) {
						stm.on('close', function(code, signal) {
						    }).on('data', function(data) {
						    	//console.log(data.toString());
						      serverDate = new Date(data.toString());
						      resolve(true)
						    });    						
					})
					yield pDate;
					l.vlog("Server time is: " + serverDate);
					var now = new Date();
					if (!options.skipTimeCheck && Math.abs(now-serverDate)/1000>options.timeDrift) {
						l.logw("Server and local times differ quite a lot (~"+Math.round(Math.abs(serverDate-now)/1000)+" secs):\nServer Time: "+serverDate+"\nLocal Time : "+now+"\nSync will give erratic results unless this is rectified.")
						if (!options.force) {
							conn.end();
							resolve(false);
							return;
						}
					}
					var MIN_TIME_DRIFT = 5;
					if (Math.abs(now-serverDate)/1000<(options.timeDrift + MIN_TIME_DRIFT)) {
						// use a tighter timeDrift, down to 5 secs, if we can.
						options.timeDrift = Math.max(MIN_TIME_DRIFT, Math.abs(now-serverDate)/1000+MIN_TIME_DRIFT);
						l.vlog("Time drift set to "+options.timeDrift+"s")

					}

					// Start sftp
					var sftp = yield conn.sftpP();

					// promisify a few funcs we'll use
					"readdir,readFile,writeFile,fastGet,fastPut,mkdir,unlink,utimes,stat".split(',').forEach(function(fn) {
						sftp[fn+'P'] = Promise.promisify(sftp[fn])
					});

					// read remote sync, if we can
					var lastSync = -1;
					try {
						lastSync = parseInt(yield sftp.readFileP(posix.join(remotePath,sync_helper.SYNC_FILE), {}));
						if (isNaN(lastSync)) lastSync = -1;
					}
					catch(e) {
					}
					l.vlog('Last remote sync: ' + lastSync);
					l.vlog('Last local sync: ' + local.lastSyncTime);
					var changes = local.lastFileTime > local.lastSyncTime ||
								local.lastSyncTime != lastSync || 
								local.lastSyncTime === -1 || lastSync === -1;


					if (changes || options.force) {
						// there are/will be changes to be made

						try { 
							yield sftp.mkdirP(remotePath,0)
						}
						catch(e) { }

						// process remote files
						yield _walk(sftp, lastSync, remotePath);

						// cope with extra local files not able to be compared 
						// (ie. Remote file is missing)
						while (local.items.length) {
							var item = local.items[0];
							var remoteFile = path.join(remotePath, item.path).replace(/\\/g, posix.sep);
							var s = sync_helper.determineSync(local, posix.relative(remotePath, remoteFile), undefined, lastSync, options);
							yield _handleFile(sftp, s.action, s.localFile, s.localStats, remoteFile, undefined)
						}

						// if remote updated, or new files magically apeared on server, create new sync time from NOW.
						if (remoteModified || lastRemoteFileTime>lastSync) {
							var syncTime = yield sync_helper.setSynced(localPath);
							var remoteFile = path.join(remotePath, sync_helper.SYNC_FILE);
							yield sftp.writeFileP(remoteFile, syncTime.toString(), {})
							yield sftp.utimesP(remoteFile, syncTime, syncTime);
						}
						else
						{
							// set local sync time to server sync time
							// we just downloaded files
							var syncTime = yield sync_helper.setSynced(localPath, lastSync);
						}
						l.vlog("sync time is now " + syncTime)

					}
					else
						l.log("Nothing to do")
					l.vlog('closing...')
					conn.end();
					resolve(p);
					return true;
				})();
					
					
				

		  	}).connect(connectInfo);
		  });
	})();
}

