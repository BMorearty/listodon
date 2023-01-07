<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    // Delete the 'instance' cookie but leave the rest so the user can specify
    // that instance again in the future and we can look for the existing token
    // in the token-<instancename> cookie.
    document.cookie = 'instance=; max-age=0; SameSite=Lax';
    goto('/');
  });
</script>
