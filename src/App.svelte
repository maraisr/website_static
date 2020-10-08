<script lang="ts">
	import {theme as lightTheme} from './themes/light.treat';
	import {theme as darkTheme} from './themes/dark.treat';

	import { resolveClassName } from 'treat';

	import * as styleRefs from './Header.treat';

	import Header from './Header.svelte';

	let currentTheme = lightTheme;

	interface Test {
		foo: string;
	}

	const example: Test = { foo: 'marais' };
</script>

<main>
	<Header />
	well then

	<button on:click={() => currentTheme = (currentTheme === lightTheme ? darkTheme : lightTheme)}>
		Toggle Theme
	</button>

	<p class={resolveClassName(currentTheme, styleRefs.root)}>{example.foo}</p>
</main>
