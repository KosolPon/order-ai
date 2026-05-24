<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#131314" />
</svelte:head>

{@render children()}
