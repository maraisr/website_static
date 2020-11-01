exports.svelte = function (config) {
	config.preprocess = require('svelte-preprocess')();
	config.immutable = true;
};
