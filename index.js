var path = require('path');
var fs = require('fs');
var util = require('util');
var fs$1 = require('premove');
var colors = require('kleur');
var klona = require('klona');
var totalist = require('totalist');
var escalade = require('escalade');
var rsort = require('route-sort');
var zlib = require('zlib');

const read = util.promisify(fs.readFile);
const write = util.promisify(fs.writeFile);
const list = util.promisify(fs.readdir);
const exists = fs.existsSync;
function isDir(str) {
	return exists(str) && fs.statSync(str).isDirectory();
}
function match(arr, pattern) {
	return arr.find((x) => pattern.test(x));
}

function toBool(val, fallback = true) {
	return val == null ? fallback : !/(0|false)/.test(val);
}
function normalize(src, argv, extra = {}) {
	Object.assign(argv, extra);
	const cwd = (argv.cwd = path.resolve(argv.cwd || '.'));
	argv.dest = path.join(cwd, (argv.destDir = 'build'));
	argv.src = path.join(cwd, (argv.srcDir = src || 'src'));
	argv.src = isDir(argv.src) ? argv.src : cwd;
	argv.isProd = !!argv.isProd;
	argv.ssr = toBool(argv.ssr, true);
	argv.minify = argv.isProd && toBool(argv.minify, true);
	argv.sourcemap = toBool(argv.sourcemap, !argv.isProd);
}

const PWA = colors.bold('[freshie]');
const SPACER = ' '.repeat(10);
function print(color, msg) {
	console.log(
		colors[color](PWA),
		msg.includes('\n') ? msg.replace(/(\r?\n)/g, '$1' + SPACER) : msg,
	);
}
const log = print.bind(0, 'white');
const info = print.bind(0, 'cyan');
const success = print.bind(0, 'green');
const warn = print.bind(0, 'yellow');
const error = print.bind(0, 'red');
function bail(msg, code = 1) {
	error(msg instanceof Error ? msg.stack : msg);
	process.exit(code);
}
const $pkg = colors.magenta;
const $dir = colors.bold().white;

var Pattern;
(function (Pattern) {
	Pattern[(Pattern['Static'] = 0)] = 'Static';
	Pattern[(Pattern['Param'] = 1)] = 'Param';
	Pattern[(Pattern['Wild'] = 2)] = 'Wild';
})(Pattern || (Pattern = {}));
function to_segment(name) {
	if (!name || name === 'index') return [Pattern.Static, ''];
	if (name[0] !== '[') return [Pattern.Static, name];
	name = name.slice(1, -1);
	return name.substring(0, 3) === '...'
		? [Pattern.Wild, '*', name.substring(3)]
		: [Pattern.Param, ':' + name];
}
function to_pattern(rel) {
	let { dir, name } = path.parse(rel);
	let pattern = '/',
		wild = null,
		type = 0;
	let arr = [...dir.split(/[\\\/]+/g), name];
	for (let i = 0, tmp; i < arr.length; i++) {
		if (!arr[i]) continue;
		tmp = to_segment(arr[i]);
		type = Math.max(type, tmp[0]);
		if (tmp[1]) {
			if (pattern.length > 1) pattern += '/';
			pattern += tmp[1];
			if (tmp[0] === Pattern.Wild) {
				wild = tmp[2];
				break;
			}
		}
	}
	return { pattern, wild, type };
}
async function collect(src, options) {
	const routes = path.join(src, options.routes);
	if (!exists(routes)) return [];
	const { test, layout } = options;
	const PAGES = new Map();
	const isLayout = (str) => layout.test(str) && test.test(str);
	await totalist.totalist(routes, async (base, absolute) => {
		if (/^[._]/.test(base) || !test.test(base)) return;
		const rel = path.relative(routes, absolute);
		const info = {
			...to_pattern(rel),
			file: absolute,
			layout: null,
		};
		await escalade(absolute, (dirname, contents) => {
			let tmp = contents.find(isLayout);
			if (tmp) return (info.layout = path.join(dirname, tmp));
		});
		PAGES.set(info.pattern, info);
	});
	const patterns = [...PAGES.keys()];
	return rsort(patterns).map((key) => PAGES.get(key));
}

async function collect$1(src, options) {
	const entries = await list(src).then((files) => {
		let dom = match(files, /index\.(dom\.)?[tjm]sx?$/);
		if (dom) dom = path.join(src, dom);
		let ssr = match(files, /index\.ssr\.[tjm]sx?$/);
		ssr = ssr ? path.join(src, ssr) : options.ssr.entry;
		let html = match(files, /index\.html(\.(svelte|vue|[tjm]sx?))?$/);
		if (html) html = path.join(src, html);
		return { dom, ssr, html };
	});
	if (!entries.dom) throw new Error('Missing "DOM" entry file!');
	if (!entries.html) throw new Error('Missing HTML template file!');
	return entries;
}

async function collect$2(src, options) {
	const ERRORS = [];
	const { test, layout, errors } = options;
	const dir = path.join(src, errors);
	if (!exists(dir)) return ERRORS;
	let hasXXX = false,
		standin;
	const isLayout = (str) => layout.test(str) && test.test(str);
	await totalist.totalist(dir, async (base, absolute) => {
		if (/^[._]/.test(base) || !test.test(base)) return;
		const { name } = path.parse(base);
		if (name === 'xxx') {
			hasXXX = true;
			if (standin) {
				standin.file = absolute;
				return;
			}
		}
		const info = {
			file: absolute,
			layout: null,
			key: name,
		};
		if (name === 'index') {
			if (hasXXX) return;
			info.key = 'xxx';
			standin = info;
		}
		await escalade(absolute, (dirname, contents) => {
			let tmp = contents.find(isLayout);
			if (tmp) return (info.layout = path.join(dirname, tmp));
		});
		ERRORS.push(info);
	});
	return ERRORS;
}

function load(str, dir) {
	str = path.resolve(dir || '.', str);
	return exists(str) && require(str);
}
function from(dir, id) {
	return require.resolve(id, { paths: [dir, __dirname] });
}

const packages = new Set();
function list$1(cwd) {
	if (packages.size) return packages;
	const rgx = /^@freshie\//i;
	const pkg = load('package.json', cwd);
	if (pkg)
		Object.keys(
			Object.assign({}, pkg.dependencies, pkg.devDependencies),
		).forEach((name) => rgx.test(name) && packages.add(name));
	return packages;
}

const defaults = {
	publicPath: '/',
	alias: {
		entries: {
			'~routes': '',
			'~components': 'components',
			'~assets': '',
			'~utils': 'utils',
			'~tags': 'tags',
		},
	},
	ssr: {
		type: null,
		entry: null,
	},
	templates: {
		routes: 'routes',
		layout: /^_layout/,
		test: /\.([tj]sx?|svelte|vue)$/,
		errors: 'errors',
	},
	assets: {
		dir: 'assets',
		test: /\.(svg|woff2?|ttf|eot|jpe?g|png|gif|mp4|mov|ogg|webm)$/,
	},
	copy: ['static', 'public'],
	replace: {
		__DEV__: 'true',
		__BROWSER__: 'true',
		'process.browser': 'true',
		'process.env.NODE_ENV': 'development',
		__SSR__: 'true',
	},
	resolve: {
		extensions: ['.mjs', '.js', '.jsx', '.json'],
		mainFields: ['module', 'jsnext', 'jsnext:main', 'main'],
	},
	commonjs: {
		extensions: ['.js', '.cjs'],
	},
	json: {
		preferConst: true,
		namedExports: true,
		indent: '  ',
	},
	terser: {
		mangle: true,
		compress: true,
		output: {
			comments: false,
		},
	},
};

function Copy(dirs = []) {
	return {
		name: 'plugins/copy',
		async generateBundle() {
			await Promise.all(
				dirs.map((dir) => {
					return (
						exists(dir) &&
						totalist.totalist(dir, (rel, abs) => {
							this.emitFile({
								type: 'asset',
								source: fs.readFileSync(abs),
								fileName: rel,
							});
						})
					);
				}),
			);
		},
	};
}

function toPreload(href, type) {
	return `<link rel="preload" href="${href}" as="${type}"/>`;
}
function parse(value) {
	return require('node-html-parser').parse(value);
}
function append(base, content) {
	let node = parse(content);
	base.appendChild(node);
}
function HTML(template, opts = {}) {
	const { publicPath = '/', preload = true, minify = true } = opts;
	return {
		name: 'plugins/html',
		async generateBundle(config, bundle) {
			const { format } = config;
			const entryAssets = new Set();
			for (let key in bundle) {
				if (!/\.js$/.test(key)) continue;
				let tmp = bundle[key];
				if (!tmp.isEntry) continue;
				entryAssets.add(key);
				tmp.imports.forEach((str) => entryAssets.add(str));
				tmp.referencedFiles.forEach((str) => entryAssets.add(str));
			}
			let document = parse(await read(template, 'utf8'));
			if (entryAssets.size > 0) {
				const dochead = document.querySelector('head');
				const docbody = document.querySelector('body');
				for (let filename of entryAssets) {
					filename = publicPath + filename;
					if (/\.css$/.test(filename)) {
						if (preload)
							append(dochead, toPreload(filename, 'style'));
						append(
							dochead,
							`<link rel="stylesheet" href="${filename}"/>`,
						);
					} else if (/\.m?js$/.test(filename)) {
						if (/esm?/.test(format)) {
							if (preload)
								append(
									dochead,
									`<link rel="modulepreload" href="${filename}"/>`,
								);
							append(
								docbody,
								`<script type="module" src="${filename}"></script>`,
							);
							append(
								docbody,
								`<script nomodule defer src="https://unpkg.com/dimport/nomodule" data-main="${filename}"></script>`,
							);
						} else {
							if (preload)
								append(dochead, toPreload(filename, 'script'));
							append(
								docbody,
								`<script src="${filename}"></script>`,
							);
						}
					}
				}
			}
			if (minify) document.removeWhitespace();
			this.emitFile({
				type: 'asset',
				fileName: 'index.html',
				source: document.toString(),
			});
		},
	};
}

const DIR_ENV = path.join(__dirname, '..', 'env', 'index.mjs');
const DIR_HTTP = path.join(__dirname, '..', 'http', 'index.mjs');
const DIR_ROUTER = path.join(__dirname, '..', 'router', 'index.mjs');
const Router = {
	name: 'plugins/router',
	resolveId: (id) => (id === 'freshie/router' ? DIR_ROUTER : null),
};
const HTTP = {
	name: 'plugins/http',
	resolveId: (id) => (id === 'freshie/http' ? DIR_HTTP : null),
};
const ENV = {
	name: 'plugins/env',
	resolveId: (id) => (id === 'freshie/env' ? DIR_ENV : null),
};

const RUNTIME = path.join(__dirname, '..', 'runtime', 'index.dom.js');
async function xform(src, file, routes, errors, isDOM) {
	const fdata = await read(file, 'utf8');
	const Layouts = new Map();
	let count = 0,
		imports = '',
		$routes = '',
		$errors = '';
	const to = (file) => file.replace(src, '\0src').replace(/[\\\/]+/g, '/');
	function to_layout(file) {
		let local = file && Layouts.get(file);
		if (file && local) return local;
		if (file && !local) {
			Layouts.set(file, (local = `$Layout${count++}`));
			imports += `import * as ${local} from '${to(file)}';\n`;
			return local;
		}
	}
	routes.forEach((tmp, idx) => {
		if ($routes) $routes += '\n\t';
		if (isDOM) {
			let views = [`import('${to(tmp.file)}')`];
			if (tmp.layout) views.unshift(`import('${to(tmp.layout)}')`);
			$routes += `define('${tmp.pattern}', () => Promise.all([ ${views} ]));`;
		} else {
			let views = [`$Route${idx}`];
			let layout = to_layout(tmp.layout);
			if (layout) views.unshift(layout);
			imports += `import * as $Route${idx} from '${to(tmp.file)}';\n`;
			$routes += `define('${tmp.pattern}', ${views});`;
		}
	});
	errors.forEach((tmp, idx) => {
		if (isDOM) {
			let views = [`import('${to(tmp.file)}')`];
			if (tmp.layout) views.unshift(`import('${to(tmp.layout)}')`);
			$errors += `'${tmp.key}': () => Promise.all([ ${views} ]),`;
		} else {
			let views = [`$Error${idx}`];
			let layout = to_layout(tmp.layout);
			if (layout) views.unshift(layout);
			imports += `import * as $Error${idx} from '${to(tmp.file)}';\n`;
			$errors += `'${tmp.key}': prepare([${views}]),`;
		}
	});
	console.log('CONTENT FOR', file);
	console.log(imports);
	console.log('----');
	if (imports) imports += '\n';
	return (
		imports +
		fdata
			.replace('/* <ROUTES> */', $routes)
			.replace('/* <ERRORS> */', $errors)
	);
}
function Runtime(src, routes, errors, isDOM) {
	const ident = 'freshie/runtime';
	return {
		name: 'plugins/runtime',
		resolveId: (id) => {
			if (isDOM && id === ident) return id;
			if (id.startsWith('\0src')) {
				console.log('RUNTIME if-2', {
					src,
					replaced: id.replace('\0src', ''),
				});
				return path.join(src, id.replace('\0src', ''));
			}
		},
		load: (id) => {
			if (id === ident) return xform(src, RUNTIME, routes, errors, isDOM);
			if (/[\\\/]+@freshie[\\\/]+ssr/.test(id))
				return xform(src, id, routes, errors, isDOM);
		},
	};
}

const exists$1 = (file, msg) => exists(file) || error(msg);

function Template(file) {
	const ident = '!!~html~!!';
	return {
		name: 'plugins/template',
		buildStart() {
			exists$1(file, 'Cannot find pre-built "index.html" template!');
		},
		resolveId(id) {
			return id === ident ? ident : null;
		},
		async load(id) {
			if (id !== ident) return null;
			let html = await read(file, 'utf8');
			return `export const HTML = \`${html}\`;`;
		},
	};
}

const UNITS = ['B', 'kB', 'MB', 'GB'];
function size(val) {
	if (!val) return '0.00 kB';
	let exp = Math.min(Math.floor(Math.log10(val) / 3), UNITS.length - 1) || 1;
	let out = (val / Math.pow(1e3, exp)).toPrecision(3);
	let idx = out.indexOf('.');
	if (idx === -1) {
		out += '.00';
	} else if (out.length - idx - 1 !== 2) {
		out = (out + '00').substring(0, idx + 3);
	}
	return out + ' ' + UNITS[exp];
}
function time(ms = 0) {
	return (ms / 1e3).toFixed(2) + 's';
}

const gut2 = ' '.repeat(2);
const gut4 = ' '.repeat(4);
const th = colors.dim().bold().italic().underline;
const rpad = (str, max) => str.padEnd(max);
const lpad = (str, max) => str.padStart(max);
const levels = [colors.cyan, colors.yellow, colors.red];
let max = { file: 0, size: 0, gzip: 0 };
function Summary(opts = {}) {
	const { isDOM } = opts;
	let start;
	let name = colors
		.bold()
		.underline()
		.green(isDOM ? 'DOM' : 'SSR');
	return {
		name: 'plugins/summary',
		buildStart() {
			start = Date.now();
		},
		generateBundle(_config, bundle) {
			let tmp,
				out = `Compiled ${name} output in ${time(Date.now() - start)}`;
			let assets = Object.keys(bundle)
				.sort()
				.map((file) => {
					let code = bundle[file].code || bundle[file].source;
					let len = size(code.length);
					let gz = zlib.gzipSync(code).length;
					let notice = gz >= 2e5 ? 2 : gz >= 1e5 ? 1 : 0;
					tmp = { file, size: len, gzip: size(gz), notice };
					max.file = Math.max(max.file, file.length);
					max.gzip = Math.max(max.gzip, tmp.gzip.length);
					max.size = Math.max(max.size, len.length);
					return tmp;
				});
			if (isDOM) {
				max.file += 4;
				max.size += 4;
			}
			out +=
				'\n\n' +
				th(rpad('Filename', max.file)) +
				gut4 +
				th(lpad('Filesize', max.size)) +
				gut2 +
				colors.dim().bold().italic(lpad('(gzip)', max.gzip));
			assets.forEach((obj) => {
				let fn = levels[obj.notice];
				let gz = colors.italic(
					(obj.notice ? fn : colors.dim)(
						gut2 + lpad(obj.gzip, max.gzip),
					),
				);
				out +=
					'\n' +
					colors.white(rpad(obj.file, max.file)) +
					gut4 +
					fn(lpad(obj.size, max.size)) +
					gz;
			});
			success(out + '\n');
		},
	};
}

function merge(old, nxt, context) {
	for (let k in nxt) {
		if (k === 'rollup') continue;
		if (typeof nxt[k] === 'function') {
			old[k] = old[k] || {};
			nxt[k](old[k], context);
		} else {
			old[k] = nxt[k] || old[k];
		}
	}
}
function assemble(configs, argv, ssr = false) {
	const options = klona.klona(defaults);
	const { src, minify, isProd, cwd, sourcemap } = argv;
	const context = { ssr, minify, isProd, sourcemap, src, cwd };
	configs.forEach((tmp) => merge(options, tmp, context));
	const aliases = options.alias.entries;
	aliases['~assets'] = options.assets.dir;
	aliases['~routes'] = options.templates.routes;
	for (let key in aliases) {
		let tmp = aliases[key];
		aliases[key] = path.resolve(src, tmp);
	}
	options.copy = options.copy.map((dir) => path.resolve(src, dir));
	options.replace.__DEV__ = String(!isProd);
	options.replace['process.env.NODE_ENV'] = JSON.stringify(
		isProd ? 'production' : 'development',
	);
	return { options, context };
}
async function load$1(argv) {
	const { cwd, src, isProd } = argv;
	const file = load('freshie.config.js', cwd);
	const configs = [];
	const customize = [];
	let DOM, SSR, uikit;
	function autoload(name) {
		info(`Applying ${$pkg(name)} preset`);
		let abs = from(cwd, path.join(name, 'config.js'));
		let { rollup, ...rest } = require(abs);
		if (/[/]ui\./.test(name)) uikit = uikit || name;
		if (rollup) customize.push(rollup);
		configs.push(rest);
	}
	list$1(cwd).forEach(autoload);
	if (file) {
		info(`Applying "${$dir('freshie.config.js')}" config`);
		let { rollup, ...rest } = file;
		if (rollup) customize.push(rollup);
		configs.push(rest);
	}
	DOM = assemble(configs, argv);
	const { options } = DOM;
	const routes = await collect(src, options.templates);
	if (!routes.length) throw new Error('No routes found!');
	const errors = await collect$2(src, options.templates);
	if (uikit && !errors.find((x) => x.key === 'xxx'))
		errors.push({
			file: options.alias.entries['!!~error~!!'],
			layout: null,
			key: 'xxx',
		});
	const entries = await collect$1(src, options);
	const client = Client(
		argv,
		routes,
		entries,
		errors,
		DOM.options,
		DOM.context,
	);
	let server;
	if (argv.ssr && !isProd) {
		options.ssr.type = 'node';
	} else if (argv.ssr && !options.ssr.type) {
		autoload('@freshie/ssr.node');
		argv.ssr = true;
	} else if (!argv.ssr) {
		options.ssr.type = null;
	}
	if (argv.ssr) {
		SSR = assemble(configs, argv, true);
		if (!SSR.options.ssr.type) {
			SSR.options.ssr = options.ssr;
		}
		if (uikit) {
			SSR.options.alias.entries['!!~ui~!!'] = from(cwd, uikit);
		}
		server = Server(
			argv,
			routes,
			entries,
			errors,
			SSR.options,
			SSR.context,
		);
	}
	customize.forEach((mutate) => {
		mutate(client, DOM.context, DOM.options);
		if (server) mutate(server, SSR.context, SSR.options);
	});
	client.plugins.push(Summary({ isDOM: true }));
	if (server) server.plugins.push(Summary({ isDOM: false }));
	return { options, client, server };
}
function Client(argv, routes, entries, errors, options, context) {
	const { src, isProd, minify, sourcemap } = context;
	return {
		input: entries.dom,
		output: {
			sourcemap: !!sourcemap,
			dir: path.join(argv.dest, 'client'),
			minifyInternalExports: isProd,
			entryFileNames: isProd ? '[name].[hash].js' : '[name].js',
			assetFileNames: isProd ? '[name].[hash].[ext]' : '[name].[ext]',
			chunkFileNames: isProd ? '[name].[hash].js' : '[name].js',
		},
		preserveEntrySignatures: isProd ? false : 'strict',
		treeshake: isProd && {
			moduleSideEffects: 'no-external',
			tryCatchDeoptimization: false,
		},
		plugins: [
			ENV,
			HTTP,
			Router,
			Copy(options.copy),
			HTML(entries.html, options),
			Runtime(src, routes, errors, true),
			require('@rollup/plugin-alias')(options.alias),
			require('@rollup/plugin-replace')({
				...options.replace,
				__BROWSER__: 'true',
				'process.browser': 'true',
				__SSR__: 'false',
			}),
			require('@rollup/plugin-node-resolve').default({
				browser: true,
				...options.resolve,
				rootDir: src,
			}),
			require('@rollup/plugin-json')({
				compact: isProd,
				...options.json,
			}),
			require('rollup-route-manifest')({
				merge: true,
				inline: true,
				headers: false,
				filename: false,
				routes(file) {
					if (file === entries.dom) return '*';
					for (let i = 0; i < routes.length; i++) {
						if (routes[i].file === file) return routes[i].pattern;
					}
				},
				format(files) {
					return files.map((x) => x.href);
				},
			}),
			require('@rollup/plugin-commonjs')(options.commonjs),
			minify && require('rollup-plugin-terser').terser(options.terser),
		],
	};
}
function Server(argv, routes, entries, errors, options, context) {
	const { src, isProd, minify, sourcemap } = context;
	const template = path.join(argv.dest, 'client', 'index.html');
	return {
		input:
			entries.ssr || options.ssr.entry || path.join(src, 'index.ssr.js'),
		output: {
			file: path.join(argv.dest, 'server', 'index.js'),
			minifyInternalExports: isProd,
			sourcemap: !!sourcemap,
		},
		treeshake: {
			propertyReadSideEffects: false,
			moduleSideEffects: 'no-external',
			tryCatchDeoptimization: false,
		},
		plugins: [
			ENV,
			HTTP,
			Template(template),
			Runtime(src, routes, errors, false),
			require('@rollup/plugin-alias')(options.alias),
			require('@rollup/plugin-replace')({
				...options.replace,
				__BROWSER__: 'false',
				'process.browser': 'false',
				__SSR__: 'true',
			}),
			require('@rollup/plugin-node-resolve').default({
				browser: false,
				...options.resolve,
				rootDir: src,
			}),
			require('@rollup/plugin-json')({
				compact: isProd,
				...options.json,
			}),
			require('@rollup/plugin-commonjs')(options.commonjs),
			minify && require('rollup-plugin-terser').terser(options.terser),
		],
	};
}

async function compile(rollup, config) {
	return rollup(config).then((b) => b.write(config.output));
}
async function build(src, argv) {
	try {
		normalize(src, argv, { isProd: true });
		const config = await load$1(argv).catch(bail);
		if (exists(argv.dest)) {
			warn(`Removing "${$dir(argv.destDir)}" directory`);
			await fs$1.premove(argv.dest);
		}
		const { rollup } = require('rollup');
		await compile(rollup, config.client);
		if (config.server) await compile(rollup, config.server);
		success('Build complete! 🎉');
	} catch (err) {
		bail(err);
	}
}

function Watcher(config, argv) {
	const { src, dest } = argv;
	const watcher = require('rollup').watch(config);
	let CHANGED = new Set();
	watcher.on('change', (file) => {
		if (file.startsWith(src)) {
			CHANGED.add('/' + path.relative(src, file));
		} else console.error('[CHANGE] NOT WITHIN SOURCE: "%s"', file);
	});
	watcher.on('event', (evt) => {
		console.log(evt);
		switch (evt.code) {
			case 'START': {
				CHANGED.clear();
				break;
			}
			case 'BUNDLE_END': {
				console.info(`Bundled in ${evt.duration}ms`);
				break;
			}
			case 'ERROR': {
				console.error('ERROR', evt.error);
				break;
			}
		}
	});
	return watcher;
}

async function index(src, argv) {
	normalize(src, argv, { isProd: false });
	const config = await load$1(argv).catch(bail);
	if (exists(argv.dest)) {
		warn(`Removing "${$dir(argv.destDir)}" directory`);
		await fs$1.premove(argv.dest);
	}
	Watcher(config.client, argv);
}

exports.build = build;
exports.watch = index;
