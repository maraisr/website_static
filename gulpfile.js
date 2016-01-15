var p = require('./package.json'),
	gulp = require('gulp'),
	$ = require('gulp-load-plugins')({lazy: true, pattern: ['gulp-*', 'debowerify', 'run-sequence', 'imagemin-*']}),
	merge = require('merge-stream'),
	source = require('vinyl-source-stream'),
	glob = require('glob'),
	_ = require('lodash');

var config = {
		js: {
			src: 'src/assets/js',
			dest: 'dist/assets'
		},
		css: {
			src: 'src/assets/scss',
			dest: 'dist/assets'
		},
		images: {
			src: 'src/assets/imgs',
			dest: 'dist/assets/imgs'
		},
		def: {
			src: 'src/assets',
			dest: 'dist/assets'
		}
	},
	dev = true;

gulp.task('styles', function () {
	return $.rubySass(config.css.src + '/main.scss', {style: 'compact', precision: 4, require: ['sass-globbing', 'breakpoint', 'susy']})
		.pipe($.csscomb())
		.pipe($.autoprefixer())
		.pipe($.combineMq())
		.pipe($.csso())
		.pipe($.csscomb())
		.pipe($.cssmin({advanced: true, aggressiveMerging: true, keepSpecialComments: false, semanticMerging: true}))
		.pipe($.rename({basename: 'app', extname: '.css'}))
		.pipe(gulp.dest((dev ? config.css.dest : 'tmp/assets')))
	//.pipe($.notify('Styles Built! [<%= file.relative %>]'));
});

gulp.task('images', function () {
	return gulp.src(config.images.src + '/**/*')
		.pipe($.imagemin({
			progressive: true,
			optimizationLevel: 7,
			multipass: true,
			svgoPlugins: [{removeViewBox: true}],
			use: [$.imageminPngquant(), $.imageminSvgo(), $.imageminJpegtran()]
		}))
		.pipe(gulp.dest(config.images.dest));

});

gulp.task('fonts', function () {
	return gulp.src(config.def.src + '/fonts/*')
		.pipe(gulp.dest(config.def.dest + '/fonts'));
});

gulp.task('js', function () {
	return gulp.src(config.js.src + '/website.js')
		.pipe($.plumberNotifier())
		.pipe($.browserify({
			transform: $.debowerify,
			insertGlobals: true,
			fullPaths: false,
			debug: true,
			paths: ['./bower_components/', config.js.src + '/modules/']
		}))
		.pipe(gulp.dest((dev ? config.js.dest : 'tmp/js/')))
	//.pipe($.notify('JavaScript Built! [<%= file.relative %>]'));
});

gulp.task('html', function () {
	$.nunjucksRender.nunjucks.configure(['src/app/templates/'], {watch: false});

	var assets;

	return gulp.src('src/app/pages/**/*.html')
		.pipe($.nunjucksRender({
			url_base: p.siteUrl,
			css_path: '/assets/app.css',
			js_path: '/assets/app.js'
		}))
		.pipe(assets = $.useref.assets({searchPath: ['tmp/', 'dist/']}))
		.pipe($.if(!dev, $.rev()))
		.pipe(assets.restore())
		.pipe($.useref())
		.pipe($.if(!dev, $.revReplace()))
		.pipe($.if('*.html', $.htmlmin({
			removeComments: true,
			collapseWhitespace: true,
			minifyJS: true,
			minifyCSS: true
		})))
		.pipe(gulp.dest('dist'));
});

gulp.task('sitemap', function () {
	return gulp.src('dist/**/*.html')
		.pipe($.sitemap({
			siteUrl: p.siteUrl,
			fileName: 'sitemap.en_AU.xml',
			changefreq: 'weekly',
			priority: 0.5,
			lastmod: Date.now(),
			mappings: [
				{
					pages: ['index.html'],
					priority: 1
				}
			]
		}))
		.pipe($.prettyData({type: 'minify'}))
		.pipe(gulp.dest('dist/'));
});

gulp.task('misc', function () {
	return gulp.src('src/app/extras/*')
		.pipe(gulp.dest('dist/'));
});

gulp.task('clean', function () {
	return gulp.src(['dist/', 'tmp/'], {read: false})
		.pipe($.rimraf())
	//.pipe($.notify('Assets cleared!'));
});

gulp.task('gzip', function () {
	return gulp.src('dist/**/*')
		.pipe($.gzip({
			append: false,
			gzipOptions: {
				level: 9
			},
		}))
		.pipe(gulp.dest('dist/'));
});

gulp.task('default', function (cb) {
	$.runSequence('clean', ['styles', 'images', 'js', 'fonts', 'misc'], 'html', cb);

	gulp.watch(config.css.src + '/**/*.scss', ['styles']);
	gulp.watch(config.images.src + '/**/*', ['images']);
	gulp.watch(config.def.src + '/fonts/*', ['fonts']);
	gulp.watch(config.js.src + '/**/*', ['js']);
	gulp.watch('src/app/**/*', ['html']);
});

gulp.task('build:js', ['js'], function () {
	var files = glob.sync('*.js', {
			cwd: 'tmp/js'
		}),
		prom = merge();

	_.each(files, function (v) {
		prom.add(gulp.src('tmp/js/' + v)
			.pipe($.closureCompiler({
				fileName: v,
				continueWithWarnings: true,
				compilerFlags: {
					compilation_level: 'SIMPLE_OPTIMIZATIONS',
					language_in: 'ECMASCRIPT5',
					language_out: 'ECMASCRIPT5',
					warning_level: 'QUIET',
					output_wrapper: '"use strict";(function(){%output%}).call(window);'
				}
			}))
			.pipe($.uglify({ascii_only: true}))
			.pipe($.rename({basename: 'app', extname: '.js'}))
			.pipe(gulp.dest('tmp/assets/')));
	});

	return prom;
});

gulp.task('build', ['clean'], function (cb) {
	dev = false;
	$.runSequence(['styles', 'images', 'fonts', 'misc'], 'sitemap', 'build:js', 'html', 'gzip', cb);
});
