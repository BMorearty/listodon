<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    deleteAllCookies();
    goto('/');
  });

  function deleteAllCookies() {
    const cookies = document.cookie.split(/; ?/);

    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
      document.cookie = name + '=; max-age=0';
    }
  }
</script>
