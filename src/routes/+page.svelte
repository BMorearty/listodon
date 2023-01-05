<script lang="ts">
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import { cubicIn } from 'svelte/easing';
  import sanitizeHtml from 'sanitize-html';

  export let data;
  const { fetch } = data;
  let { url } = $page;
  const localhost = url.href.includes('local');
  let errors: string[] = [];
  let form: HTMLFormElement;
  let showForm = false;
  let acct;
  let instance;
  let authCode;
  let scopes = 'read:accounts read:follows read:lists';
  let clientId;
  let clientSecret;
  let token;

  function load() {
    const cookies = Object.fromEntries(
      document.cookie.split(/; ?/).map((cookie) => cookie.split('=')),
    );
    authCode = cookies['authCode'];
    acct = cookies['acct'];
    instance = cookies['instance'];
    clientId = cookies['clientId'];
    clientSecret = cookies['clientSecret'];
    token = cookies['token'];
    showForm = !authCode && !token;

    if (showForm) {
      return new Promise((resolve) => resolve({}));
    } else if (token) {
      return verifyCredentials();
    } else if (authCode) {
      return createToken();
    }
  }

  function handleSubmit() {
    instance = form.elements['instance'].value;
    authCode = form.elements['authCode']?.value;
    document.cookie = `instance=${instance}; SameSite=Lax`;
    document.cookie = `authCode=${authCode}; max-age=10; SameSite=Lax`;
    if (!authCode) {
      createApp();
    } else {
      createToken();
    }
  }

  // Creates the app if it doesn't already exist on the Mastodon instance.
  async function createApp() {
    const body = new FormData();
    body.append('client_name', 'Listodon');
    body.append('redirect_uris', 'https://listodon.local:5173/code');
    body.append('scopes', scopes);
    // formData.append('website', 'something')
    const appResponse = await fetch(`https://${instance}/api/v1/apps`, { method: 'POST', body });
    const appJson = await appResponse.json();
    if (!appResponse.ok) {
      errors = [...errors, `Error creating app: <pre>${JSON.stringify(appJson)}</pre>`];
    } else {
      clientId = appJson['client_id'];
      clientSecret = appJson['client_secret'];
      document.cookie = `clientId=${clientId}; SameSite=Lax`;
      document.cookie = `clientSecret=${clientSecret}; SameSite=Lax`;
      authorize();
    }
  }

  function authorize() {
    const authUrl = new URL(`https://${instance}/oauth/authorize`);
    authUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://listodon.local:5173/code',
      scope: scopes,
    }).toString();
    location.assign(authUrl);
  }

  async function createToken() {
    const body = new FormData();
    body.append('client_id', clientId);
    body.append('client_secret', clientSecret);
    body.append('redirect_uri', 'https://listodon.local:5173/code');
    body.append('grant_type', 'authorization_code');
    body.append('code', authCode);
    body.append('scope', scopes);
    const tokenResponse = await fetch(`https://${instance}/oauth/token`, {
      method: 'POST',
      body,
    });
    const tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok) {
      errors = [...errors, `Error getting access token: <pre>${JSON.stringify(tokenJson)}</pre>`];
    } else {
      token = tokenJson['access_token'];
      showForm = false;
      document.cookie = `token=${token}; SameSite=Lax`;
      return verifyCredentials();
    }
  }

  async function verifyCredentials() {
    const verifyResponse = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `bearer ${token}` },
    });
    const verifyJson = await verifyResponse.json();
    if (!verifyResponse.ok) {
      errors = [...errors, `<pre>${JSON.stringify(verifyJson)}</pre>`];
    } else {
      acct = verifyJson.acct;
      document.cookie = `acct=${acct}; SameSite=Lax`;
      return getFollowingNotInLists(verifyJson.id);
    }
  }

  async function getFollowingNotInLists(userId) {
    // id, username (short handle), acct (full handle), display_name
    const following = await (
      await fetch(`https://${instance}/api/v1/accounts/${userId}/following`, {
        headers: { Authorization: `bearer ${token}` },
      })
    ).json();

    // lists has id and title
    const lists = await (
      await fetch(`https://${instance}/api/v1/lists`, {
        headers: { Authorization: `bearer ${token}` },
      })
    ).json();

    const usersInLists = (
      await Promise.all(
        lists.map(
          async (list) =>
            await (
              await fetch(`https://${instance}/api/v1/lists/${list.id}/accounts?limit=0`, {
                headers: { Authorization: `bearer ${token}` },
              })
            ).json(),
        ),
      )
    ).flat();

    let notInLists = [];
    let allInLists = false;

    for (const userInFollowing of following) {
      if (!usersInLists.some((userInList) => userInList.id === userInFollowing.id)) {
        notInLists = [...notInLists, userInFollowing];
      }
    }

    if (notInLists.length === 0) {
      allInLists = true;
    }

    return { notInLists, allInLists };
  }
</script>

{#if showForm}
  <form bind:this={form} on:submit|preventDefault={handleSubmit}>
    <label
      >What is your Mastodon instance?
      <input id="instance" name="instance" type="text" />
    </label>
    <br />
    {#if localhost}
      <!-- On localhost let the user just paste the oauth code.-->
      <section>
        <label
          >Optionally enter your authorization code
          <input id="authCode" name="authCode" type="text" />
        </label>
      </section>
    {/if}
    <input type="submit" value="Submit" />
  </form>
{/if}

<main>
  {#await load()}
    loading...
  {:then { notInLists, allInLists }}
    {#if allInLists}
      <div class="allInLists">Congrats! You have put all your followed users in lists.</div>
    {:else if notInLists}
      <div class="notInLists" transition:slide={{ easing: cubicIn, duration: 200 }}>
        Your account <span class="acct">@{acct}@{instance}</span> follows these users that you
        haven’t yet put in a list:
        <br /><br />
        {#each notInLists as { avatar, display_name, acct, note }}
          <img src={avatar} alt={display_name} width="46" height="46" />
          <strong>{display_name}</strong>
          <br />
          <span class="acct"><a href="https://{instance}/@{acct}">{acct}</a></span>
          <br />
          {@html sanitizeHtml(note)}
          <hr />
        {/each}
      </div>
    {/if}
    <div class="errors">
      {#each errors as error}
        <div>{@html error}</div>
      {/each}
    </div>
  {/await}
</main>

<style>
  .acct {
    font-weight: bold;
    font-family: Consolas, 'Courier New', sans-serif;
  }
</style>
