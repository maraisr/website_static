const gulp = require('gulp'),
	gutil = require('gulp-util'),
	connect = require('gulp-connect'),
	{ orderBy, merge } = require('lodash'),
	moment = require('moment-timezone'),
	pkg = require('./package.json'),
	rimraf = require('rimraf'),
	mustache = require('mustache'),
	parallelize = require('concurrent-transform');

const isProd = process.env.NODE_ENV == 'production';

let PUG_LOCALS = {
	LASTMOD: moment.tz(pkg.config.loc).format(),
	DOMAIN: isProd ? pkg.config.domain : 'http://localhost:3303/',
	VERSION: pkg.version
};

let watching = false;

Object.defineProperty(pkg, 'fresh', {
	get: () =>
		(fresh => {
			fresh.employment = (emp => {
				emp.history = orderBy(emp.history, v => {
					return new Date(v.start).getUTCMilliseconds();
				});

				emp.history.forEach(item => {
					item.keywords.sort();
				});

				return emp;
			})(fresh.employment);

			return fresh;
		})(
			(fresh => {
				return JSON.parse(mustache.render(fresh, PUG_LOCALS));
			})(JSON.stringify(require('./src/app/meta/fresh.json')))
		)
});

function plumb() {
	return require('gulp-plumber')({
		errorHandler: require('gulp-notify').onError(
			'Error: <%= error.message %>'
		)
	});
}

function webpackCallback(err, stats) {
	if (err) throw require('gulp-notify')()(err);

	gutil.log(
		'[webpack]',
		stats.toString({
			colours: true,
			progress: true
		})
	);
}

gulp.task('default', ['images', 'js', 'scss', 'pug', 'fonts', 'images']);

gulp.task('clean', done => rimraf('./dist/**/*', done));

gulp.task('prewatch', () => (watching = true));
gulp.task('watch', ['prewatch', 'default'], () => {
	gulp.watch('./src/app/**/*.pug', ['pug']);
	gulp.watch('./src/assets/**/*.scss', ['scss']);
	gulp.watch('./src/assets/img/**/*', ['images']);

	require('webpack')(
		Object.assign({ watch: true }, require('./webpack.config.js')),
		webpackCallback
	);
});

gulp.task('serve', ['watch'], () =>
	connect.server({
		livereload: true,
		root: ['./dist/'],
		port: 3303
	})
);

gulp.task('pug', () => {
	return gulp
		.src('./src/app/[!_]*.pug')
		.pipe(plumb())
		.pipe(
			require('gulp-pug')({
				doctype: 'html5',
				pretty: false,
				locals: (function() {
					const defaults = {
						moment: moment,
						LOC: pkg.config.loc,
						SITE: require('./src/app/meta/site.json'),
						FRESH: (returns => {
							let limit = 4;

							if (returns.employment.history.length > limit) {
								returns.employment.history = returns.employment.history.splice(
									returns.employment.history.length - limit,
									limit
								);
							}

							return returns;
						})(pkg.fresh),
						_SKILLS: ((legend, fresh) => {
							const returns = [];

							fresh.skills.sets.forEach(item =>
								item.skills.forEach(skillItem =>
									returns.push({
										zone: item.name,
										skill: skillItem,
										css: item.level
									})
								)
							);

							return {
								list: orderBy(
									orderBy(returns, 'skill'),
									'zone'
								),
								legend: legend
							};
						})(
							require('./src/app/meta/skills-legend.json'),
							pkg.fresh
						)
					};

					return merge(defaults, PUG_LOCALS);
				})()
			})
		)
		.pipe(
			require('gulp-posthtml')(
				(returns => {
					returns.push(
						require('posthtml-minifier')({
							removeComments: true,
							collapseWhitespace: true,
							keepClosingSlash: true,
							sortClassName: true,
							minifyJS: require('./config/uglifyjs'),
							minifyCSS: true
						})
					);

					if (isProd) {
						returns.push(require('posthtml-schemas')());
						returns.push(require('posthtml-json')());
						returns.push(require('posthtml-obfuscate')());
					}

					return returns;
				})([])
			)
		)
		.pipe(gulp.dest('./dist/'))
		.pipe(connect.reload());
});

gulp.task('scss', () => {
	let srcMaps = require('gulp-sourcemaps');

	let returns = gulp
		.src('./src/assets/scss/main.scss')
		.pipe(plumb())
		.pipe(srcMaps.init())
		.pipe(require('gulp-sass-bulk-import')())
		.pipe(
			require('gulp-sass')({
				importer: require('sass-module-importer')()
			})
		)
		.pipe(
			require('gulp-postcss')(
				(() => {
					const prfxOpts = {
						//http://browserl.ist/?q=chrome+%3E%3D+51%2C+ie+%3E%3D+11%2C+edge+%3E%3D13%2C+safari+%3E%3D+9.1%2C+and_chr+%3E%3D+51%2C+ios+%3E+9.2
						browsers: [
							'chrome >= 50',
							'ie >= 11',
							'edge >=13',
							'safari >= 9.1',
							'and_chr >= 51',
							'ios > 9.2'
						],
						cascade: false,
						supports: true,
						add: true,
						remove: true
					};

					let steps = [
						'postcss-position',
						'lost',
						[
							'postcss-pxtorem',
							{
								selectorBlackList: [/:root/i]
							}
						],
						['autoprefixer', prfxOpts],
						['css-mqpacker', { sort: true }]
					];

					if (isProd) {
						steps.push([
							'postcss-sorting',
							{ 'sort-order': require('cssortie') }
						]);
						steps.push([
							'cssnano',
							{
								discardComments: { removeAll: true },
								autoprefixer: prfxOpts,
								safe: false
							}
						]);
					}

					return steps.map(v => {
						if (typeof v == 'object') {
							return require(v[0])(v[1]);
						}

						return require(v);
					});
				})()
			)
		);

	returns.pipe(srcMaps.write());

	return returns.pipe(gulp.dest('./dist/')).pipe(connect.reload());
});

gulp.task('fonts', () =>
	gulp.src('./src/assets/fonts/**/*').pipe(gulp.dest('./dist/fonts/'))
);

gulp.task('images', () =>
	gulp.src('./src/assets/img/**/*').pipe(gulp.dest('./dist/img/'))
);

gulp.task('js', done => {
	if (watching) return done();

	require('webpack')(require('./webpack.config.js'), (err, stats) => {
		webpackCallback(err, stats);

		done();
	});
});

gulp.task('resume', done => {
	let fs = require('fs');
	let mkdirp = require('mkdirp');

	mkdirp('./dist/', err => {
		if (err != null) gutil.log(err);

		let fileOutput = fs.writeFileSync(
			'./dist/resume.json',
			JSON.stringify(pkg.fresh)
		);

		if (fileOutput != void 0) gutil.log(fileOutput);

		done();
	});
});

gulp.task('misc', ['resume'], () => {
	return gulp
		.src(['./src/misc/**/*'])
		.pipe(require('gulp-mustache')(PUG_LOCALS))
		.pipe(require('gulp-pretty-data')({ type: 'minify' }))
		.pipe(gulp.dest('./dist'));
});

gulp.task('fingerprint', ['default', 'misc'], done => {
	const revAll = require('gulp-rev-all');

	gulp.src('./dist/**/*.{css,js,html,map}')
		.pipe(revAll.revision({ dontRenameFile: ['.html'] }))
		.pipe(gulp.dest('./dist/'))
		.on('end', () => {
			rimraf('./dist/main.{css,js,map}', done);
		});
});

gulp.task('publish', [], () => {
	const awsPub = require('gulp-awspublish');

	const s3config = (function() {
		if (process.env.S3_BUCKET) {
			return {
				bucket: process.env.S3_BUCKET
			};
		} else {
			return require('./s3config.json');
		}
	})();

	const headers = {
			'Cache-Control': 'max-age=1209600'
		},
		s3base = {
			accessKeyId: s3config['accessKeyId'],
			secretAccessKey: s3config['secretAccessKey'],
			region: 'ap-southeast-2',
			params: {
				Bucket: s3config['bucket']
			}
		},
		rpt = { states: ['create', 'update', 'delete'] },
		s3 = awsPub.create(s3base);

	return gulp
		.src('**/!(*.map)', { cwd: 'dist/' })
		.pipe(parallelize(s3.publish(headers), 10))
		.pipe(s3.sync())
		.pipe(awsPub.reporter(rpt));
});
