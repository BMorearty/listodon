<script lang="ts">
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import { cubicIn } from 'svelte/easing';
  import sanitizeHtml from 'sanitize-html';
  import { encoded } from '../lib/encoded';
  import { getCookies } from '../lib/getCookies';

  export let data;
  const { fetch } = data;
  let { url } = $page;
  const { host } = url;
  const localhost = host.startsWith('listodon.local');
  let form: HTMLFormElement;
  let showForm = false;
  let acct;
  let instance;
  let authCode;
  let scopes = 'read:accounts read:follows read:lists';
  let clientId;
  let clientSecret;
  let token;
  let cantAuthenticate = false;
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

  async function load(): Promise<{ notInLists?: User[] }> {
    const cookies = getCookies();
    instance = cookies['instance'];
    authCode = cookies[`${encoded(instance)}-authCode`];
    acct = cookies[`${encoded(instance)}-acct`];
    clientId = cookies[`${encoded(instance)}-clientId`];
    clientSecret = cookies[`${encoded(instance)}-clientSecret`];
    token = cookies[`${encoded(instance)}-token`];
    showForm = !authCode && !token;

    if (showForm) {
      return {};
    } else if (token) {
      return verifyCredentials();
    } else if (authCode) {
      return createToken();
    }
  }

  async function handleSubmit() {
    const cookies = getCookies();
    instance = form.elements['instance'].value;
    document.cookie = `instance=${encoded(instance)}; SameSite=Lax`;
    if ((token = cookies[`${encoded(instance)}-token`])) {
      // We've already seen this server. Try to verify credentials.
      try {
        // Hide the form. This triggers load() to run again.
        showForm = false;
        return;
        // return await verifyCredentials();
      } catch (err) {
        // The old credentials didn't work. Let's re-create the app.
      }
    }
    cantAuthenticate = false;
    try {
      return await createApp();
    } catch (err) {
      cantAuthenticate = true;
      throw err;
    }
  }

  // Creates the app if it doesn't already exist on the Mastodon instance.
  async function createApp() {
    const body = new FormData();
    body.append('client_name', 'Listodon');
    body.append('redirect_uris', `https://${currentHost()}/code`);
    body.append('scopes', scopes);
    body.append('website', `https://${currentHost()}`);
    const appResponse = await fetch(`https://${instance}/api/v1/apps`, { method: 'POST', body });
    const appJson = await appResponse.json();
    if (!appResponse.ok) {
      throw new Error(`Error creating app:\n${JSON.stringify(appJson)}\n`);
    } else {
      clientId = appJson['client_id'];
      clientSecret = appJson['client_secret'];
      document.cookie = `${encoded(instance)}-clientId=${clientId}; SameSite=Lax`;
      document.cookie = `${encoded(instance)}-clientSecret=${clientSecret}; SameSite=Lax`;
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
      throw new Error(`Error getting access token:\n${JSON.stringify(tokenJson)}`);
    } else {
      token = tokenJson['access_token'];
      document.cookie = `${encoded(instance)}-token=${token}; SameSite=Lax`;
      if (showForm) {
        // This triggers load():
        showForm = false;
        return {};
      } else {
        return verifyCredentials();
      }
    }
  }

  async function verifyCredentials() {
    const verifyResponse = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `bearer ${token}` },
    });
    const verifyJson = await verifyResponse.json();
    if (!verifyResponse.ok) {
      throw new Error(`${JSON.stringify(verifyJson)}`);
    } else {
      acct = verifyJson.acct;
      document.cookie = `${encoded(instance)}-acct=${acct}; SameSite=Lax`;
      return getFollowingNotInLists(verifyJson.id);
    }
  }

  // Paginate through the users this user is following
  // https://docs.joinmastodon.org/methods/accounts/#following
  // https://docs.joinmastodon.org/api/guidelines/#pagination
  async function getFollowingUsers(userId) {
    let users: User[] = [];
    let url: string | undefined = `https://${instance}/api/v1/accounts/${userId}/following`;
    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `bearer ${token}` },
      });
      users = [...users, ...(await response.json())];
      url = undefined;
      for (const header of response.headers) {
        if (header[0].toLowerCase() === 'link') {
          const match = /<([^>]+)>; rel="next"/.exec(header[1]);
          url = match && match[1];
        }
      }
    }
    return users;
  }

  async function getFollowingNotInLists(userId) {
    const following: User[] = await getFollowingUsers(userId);

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

    let notInLists: User[] = [];

    for (const userInFollowing of following) {
      if (!usersInLists.some((userInList) => userInList.id === userInFollowing.id)) {
        notInLists = [...notInLists, userInFollowing];
      }
    }

    return { notInLists };
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
      <input type="submit" value="Submit" />
      {#if cantAuthenticate}
        <br />
        <div class="error">
          Unable to reach that instance. Type only the domain name, such as myinstance.com. Leave
          off the https and everything else.
        </div>
      {/if}
    </form>
  {:else}
    {#await load()}
      Checking with Mastodon...
    {:then { notInLists }}
      {#if notInLists.length === 0}
        <div class="topPart">
          <div class="allInLists">
            <p>
              ✅ Congrats. Your account <span class="yourAcct">@{acct}@{instance}</span> has all of its
              followed users in lists.
            </p>
            <p>Refresh to check again.</p>
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
              Your account <span class="yourAcct">@{acct}@{instance}</span> follows these users that
              you haven’t yet put in a list:
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
    {:catch err}
      <div class="error">
        An error occurred communicating with Mastodon.
        <a href="/reset">Try re-authenticating.</a>
      </div>
    {/await}
  {/if}
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
  .allInLists p:first-child {
    margin-top: 0;
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
  .error {
    padding: 20px;
    border: 3px solid firebrick;
    border-radius: 10px;
  }
</style>
