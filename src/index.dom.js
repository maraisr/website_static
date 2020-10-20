import { start } from 'freshie/runtime';
import { hydrate, render } from '@freshie/ui.svelte';

start({
	base: '/',
	hydrate,
	render
});
