import {config as ravenConfig} from 'raven-js';

ravenConfig('https://9a3bf03a46804a7681931f2aa3f98e65@sentry.io/157117')
	.install();

import Tracking from './instance/tracking';

import Nav from './instance/nav';
import Skills from './instance/skills';
import FM from './instance/fm';

Tracking.tracKPage();

Nav(document.querySelectorAll('[scroll-to]'));
Skills(document.getElementById('content-skills'));

new FM(document.getElementById('last-fm'));

console.info('Nice to see you here, check out my GitHub for the full source: https://github.com/maraisr/website');
