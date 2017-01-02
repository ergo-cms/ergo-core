# ergo-core

The API comprises of all the files in the api folder, and are exported according to their .js name. These api functions are also mimic-ed in ergo-cli which expose information in a human readable format.

For example, 

* In ergo-core/api there is an init.js and looks like this:

```
	module.exports = function(folder, ...) { }
```

* In ergo-cli/api there is another init.js. This latter calls `require('ergo-core').init` as such:

```
	module.exports.init = function(folder, ...) {  
		...
		return require('ergo-core').init(folder, ...)
	}
```


### Note:

ALL complex functions exported to the CLI api are expected to return Promises, unless intrinsically syncronous (such as config.getConfigSync).

NOT all functions are exported through the CLI api (such as 'config', which is a regular helper api).

