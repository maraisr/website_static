<script context="module">
	import Header from '../components/Header.svelte';
</script>

<style>
	@font-face {
		font-family: 'Inter';
		font-style: normal;
		font-weight: 400;
		font-display: swap;
		src: url('~assets/inter-regular.woff2') format('woff2');
	}
	@font-face {
		font-family: 'Inter';
		font-style: normal;
		font-weight: 700;
		font-display: swap;
		src: url('~assets/inter-bold.woff2') format('woff2');
	}
	@font-face {
		font-family: 'Geomanist';
		font-style: normal;
		font-weight: 400;
		font-display: swap;
		src: url('~assets/geomanist-regular.woff2') format('woff2');
	}
	@font-face {
		font-family: 'Geomanist';
		font-style: normal;
		font-weight: 700;
		font-display: swap;
		src: url('~assets/geomanist-bold.woff2') format('woff2');
	}

	:root {
		--colours-grey-1: rgba(49, 58, 68, 1);
	}

	:root {
		font: 400 16px/22px Inter, system-ui, sans-serif;
		color: var(--colours-grey-1);
	}

	:global(html) {
		background-color: #f2b33d;
	}
</style>

<Header />

<main>
	<slot />
</main>
