<script lang="ts">
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import { cubicIn } from 'svelte/easing';
  import sanitizeHtml from 'sanitize-html';

  export let data;
  const { fetch } = data;
  let { url } = $page;
  const { host } = url;
  const localhost = host.startsWith('listodon.local');
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
  interface User {
    id: string;
    username: string; // short handle
    acct: string; // full handle
    display_name: string;
  }

  // On localhost the port number will vary, so check it every time.
  function currentHost() {
    return localhost ? host : 'listodon.pages.dev';
  }

  function load(): Promise<{ allInLists: boolean; notInLists: User[] }> {
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
      // Stop showing the loading indicator immediately.
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
    body.append('redirect_uris', `https://${currentHost()}/code`);
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
      redirect_uri: `https://${currentHost()}/code`,
      scope: scopes,
    }).toString();
    location.assign(authUrl);
  }

  async function createToken() {
    const body = new FormData();
    body.append('client_id', clientId);
    body.append('client_secret', clientSecret);
    body.append('redirect_uri', `https://${currentHost()}/code`);
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
    const following: User[] = await (
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

<main>
  <h1>Listodon</h1>
  {#if showForm}
    <div class="options">
      <a href="/help">Help</a>
    </div>
    <form bind:this={form} on:submit|preventDefault={handleSubmit}>
      <label
        >What is your Mastodon instance? E.g., myinstance.com:
        <input id="instance" name="instance" type="text" />
      </label>
      {#if localhost}
        <!-- On localhost let the user just paste the oauth code.-->
        <section>
          <label
            >Optionally enter your authorization code:
            <input id="authCode" name="authCode" type="text" />
          </label>
        </section>
      {/if}
      <input type="submit" value="Submit" />
    </form>
  {/if}
  {#await load()}
    Checking with Mastodon...
  {:then { notInLists, allInLists }}
    {#if allInLists}
      <div class="topPart">
        <div class="allInLists">
          ✅ Congrats. You have put all your followed users in lists. Refresh to check again.
        </div>
        <div class="options">
          <a href="/reset">Use a different account</a>
          <a href="/help">Help</a>
        </div>
      </div>
    {:else if notInLists}
      <!--
        I'd like to use `transition` instead of `in`, but it scrolls up when you navigate to
        the /help page. https://github.com/sveltejs/kit/issues/628
      -->
      <div class="notInLists" in:slide={{ easing: cubicIn, duration: 200 }}>
        <div class="topPart">
          <div>
            Your account <span class="yourAcct">@{acct}@{instance}</span> follows these users that you
            haven’t yet put in a list:
          </div>
          <div class="options">
            <a href="/reset">Use a different account</a>
            <a href="/help">Help</a>
          </div>
        </div>
        <br />
        {#each notInLists as { avatar, display_name, acct, note }}
          <div class="user">
            <img class="avatar" src={avatar} alt={display_name} width="46" height="46" />
            <span class="displayName">{display_name}</span>
            <span class="acct"><a href="https://{instance}/@{acct}">@{acct}</a></span>
            <div class="note">{@html sanitizeHtml(note)}</div>
          </div>
        {/each}
      </div>
    {/if}
    <div class="errors">
      {#each errors as error}
        <div class="error">{@html error}</div>
      {/each}
    </div>
  {/await}
</main>

<style>
  section,
  input[type='submit'] {
    display: block;
    margin-top: 20px;
  }
  .displayName {
    font-weight: bold;
  }
  .yourAcct {
    font-weight: bold;
  }
  .topPart {
    display: flex;
    justify-content: space-between;
  }
  .topPart div {
    padding-right: 10px;
  }
  .options {
    padding: 10px;
    position: relative;
    top: -10px;
    float: right;
    border: solid lightblue 1px;
  }
  .options a {
    display: block;
  }
  .options a:not(:first-child) {
    padding-top: 10px;
  }
  .user {
    border-top: solid cornflowerblue 1px;
    padding-top: 20px;
    display: grid;
    grid-template-areas:
      'avatar name'
      'avatar acct'
      '. note';
    grid-template-columns: 60px auto;
    grid-template-rows: auto;
  }
  .avatar {
    border-radius: 8px;
    grid-area: avatar;
  }
  .displayName {
    grid-area: name;
  }
  .user .acct {
    grid-area: acct;
  }
  .note {
    grid-area: note;
    font-size: small;
    color: #666;
  }
</style>
