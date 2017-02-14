
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

// promisify a few funcs we'll use
"utimes".split(',').forEach(function(fn) {
	fs[fn+'P'] = Promise.promisify(fs[fn])
});


module.exports = _sync;

function _sync(localPath, remotePath, options, ignoreList) {
	if (!options || !options.host || !options.username)
		throw new Error("Invalid args to ssh sync");

	var Client = require('ssh2').Client;

	var connectInfo = {
	  host: options.host,
	  port: options.port || 22,
	  username: options.username || options.user,
	  //debug: console.log
	};
	if (options.password) // !? bad, but allowed
		connectInfo.password = options.password;
	else if (options.privateKey)
		connectInfo.privateKey = options.privateKey;
	else if (options.privateKeyFile)
	  	connectInfo.privateKey = require('fs').readFileSync(options.privateKeyFile)
	else
	  	connectInfo.privateKey = require('fs').readFileSync('/Users/craig/.ssh/id_rsa')
	
	if (options.passphrase)
	 	connectInfo.passphrase = options.passphrase;

	return Promise.coroutine(function *() {
		var local = yield sync_helper.loadLocal(localPath, ignoreList);

		var remoteModified = false;

		function _handleFile(sftp, action, localFile, localStats, remoteFile, remoteStats) {
			return Promise.coroutine(function *() {
				switch (action) {
					case sync_helper.UPLOAD:
						l.vlog("Uploading to " + remoteFile)
						try { 
							yield sftp.mkdirP(posix.dirname(remoteFile),0)
						}
						catch(e) { }
						remoteModified = true;
						yield sftp.fastPutP(localFile, remoteFile, {});
						//l.log("fastPut OK")
						yield sftp.utimesP(remoteFile, localStats.atime, localStats.mtime);
						//l.log("utimes OK")
						break;
					case sync_helper.DOWNLOAD:
						l.vlog("Downloading from " + remoteFile)
						yield sftp.fastGetP(remoteFile, localFile, {});
						yield fs.utimesP(localFile, remoteStats.atime, remoteStats.mtime);
						break;
					case sync_helper.REMOVE_REMOTE:
						remoteModified = true;
						l.log("TODO. Remove remote file: " + remoteFile)
						break;

					default: // == case sync_helper.IGNORE
						break;
				}
			})();
		}

		function _walk(sftp, lastSync, dir) {
			l.vlog("walking remote dir: "+dir)
			return Promise.coroutine(function *() {
				var list = yield sftp.readdirP(dir);
				for (var i=0; i<list.length; i++) {
					var item = list[i];
					var remoteFile = posix.join(dir, item.filename);
					if (item.attrs.isDirectory())
						yield _walk(sftp, lastSync, remoteFile)
					else {
						var s = sync_helper.determineSync(local, posix.relative(remotePath, remoteFile), item.attrs, lastSync);
						yield _handleFile(sftp, s.action, s.localFile, s.localStats, remoteFile, item.attrs)
					}
				}
				return true;
			})();
		}


		return new Promise(function(resolve, reject) {
			var conn = new Client();
			conn.on('ready', function() {
				l.vlog('Client :: ready');

				var p = Promise.coroutine(function *() {
					// promisify a few funcs we'll use
					"sftp,exec".split(',').forEach(function(fn) {
						conn[fn+'P'] = Promise.promisify(conn[fn])
					});
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
					if (!options.skipTimeCheck && Math.abs(now-serverDate)>120) {
						l.logw("Server and local times differ quite a lot (~"+Math.round(Math.abs(serverDate-now)/60000)+" mins):\nServer Time: "+serverDate+"\nLocal Time : "+now+"\nSync will give erratic results unless this is rectified.")
						if (!options.force) {
							conn.end();
							resolve(false);
							return;
						}
					}
					var sftp = yield conn.sftpP();

					// promisify a few funcs we'll use
					"readdir,readFile,writeFile,fastGet,fastPut,mkdir,utimes,stat".split(',').forEach(function(fn) {
						sftp[fn+'P'] = Promise.promisify(sftp[fn])
					});

					// read remote sync
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
						yield _walk(sftp, lastSync, remotePath);

						// handle extra local files not handled yet 
						// (Remote file is missing)
						if (local.items.length)
							l.vlog(local.items.length + ' local files to be uploaded');
						for (var i=0; i<local.items.length; i++) {
							var item = local.items[i];
							if (item.action) throw "Unexpected";
							var action = sync_helper.UPLOAD;

							/*if (local.lastSyncTime>-1) {
								//local *has* synced in the past
							} 
							else if (lastSync>-1) {
								// remote has synced, but we haven't
							}*/
							var remoteFile = path.join(remotePath, item.path).replace(/\\/g, posix.sep);
							yield _handleFile(sftp, action, path.join(localPath, item.path), item.stats, remoteFile, undefined)
						}

						if (remoteModified) {
							var syncTime = yield sync_helper.setSynced(localPath);
							var remoteFile = path.join(remotePath, sync_helper.SYNC_FILE);
							yield sftp.writeFileP(remoteFile, syncTime.toString(), {})
							yield sftp.utimesP(remoteFile, syncTime, syncTime);
						}
						else
						{
							// set local sync time to server sync time
							var syncTime = yield sync_helper.setSynced(localPath, lastSync);
						}
						l.vlog("sync time is now " + syncTime)

					}
					else
						l.vlog("Nothing to do")
					l.vlog('closing...')
					conn.end();
					resolve(p);
					return true;
				})();
					
					
				

		  	}).connect(connectInfo);
		  });
	})();
}

