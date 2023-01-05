<!--
  This is the redirect page from Mastadon OAuth. It redirects here with a
  'code' queryParam. We will store the code in a cookie and redirect back home.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let { url } = $page;
  let error = false;
  let authCode = url.searchParams.get('code');

  onMount(() => {
    if (authCode) {
      document.cookie = `authCode=${authCode}; max-age=10; SameSite=Lax`;
      console.log({ authCode });
      goto('/');
    } else {
      error = true;
    }
  });
</script>

{#if error}
  <main>
    An error occurred.
    <a href="/">Go back home.</a>
  </main>
{/if}
