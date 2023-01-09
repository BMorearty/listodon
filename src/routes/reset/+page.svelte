<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { setCookie } from '$lib/cookies';

  onMount(() => {
    // Delete the 'instance' cookie but leave the rest so the user can specify
    // that instance again in the future and we can look for the existing token
    // in the token-<instancename> cookie.
    setCookie('instance', '', { del: true });
    goto('/');
  });
</script>
