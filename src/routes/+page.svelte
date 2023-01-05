<script lang="ts">
  import { page } from '$app/stores';

  let { url } = $page;
  let authCode = url.searchParams.get('code');
  const localhost = url.href.includes('localhost');
  let message = '';
  let errors: string[] = [];
  let form: HTMLFormElement;
  const cookies = Object.fromEntries(
    document.cookie.split(/; ?/).map((cookie) => cookie.split('=')),
  );
  if (authCode) {
    document.cookie = `authCode=${authCode}; SameSite=Lax`;
    // url.search = '';
    // location.assign(url);
  } else {
    authCode ??= cookies['authCode'];
  }
  let showForm = !authCode;
  let instance = cookies['instance'];
  const scopes = 'read:accounts read:follows read:lists';
  let clientId = cookies['clientId'];
  let clientSecret = cookies['clientSecret'];
  let token;

  if (authCode) {
    createToken();
  }

  function authenticate() {
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
    body.append('redirect_uris', 'https://lvh.me:5173/');
    body.append('scopes', scopes);
    // formData.append('website', 'something')
    const appResponse = await fetch(`https://${instance}/api/v1/apps`, { method: 'POST', body });
    const appJson = await appResponse.json();
    if (!appResponse.ok) {
      errors = [...errors, `<br>Error creating app: <pre>${JSON.stringify(appJson)}</pre>`];
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
      redirect_uri: 'https://lvh.me:5173/',
      scope: scopes,
    }).toString();
    location.assign(authUrl);
  }

  async function createToken() {
    const body = new FormData();
    body.append('client_id', clientId);
    body.append('client_secret', clientSecret);
    body.append('redirect_uri', 'https://lvh.me:5173/');
    body.append('grant_type', 'authorization_code');
    body.append('code', authCode);
    body.append('scope', scopes);
    const tokenResponse = await fetch(`https://${instance}/oauth/token`, { method: 'POST', body });
    const tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok) {
      errors = [...errors, `Error getting access token: <pre>${JSON.stringify(tokenJson)}</pre>`];
    } else {
      token = tokenJson['access_token'];
      showForm = false;
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
    for (const userInFollowing of following) {
      if (!usersInLists.some((userInList) => userInList.id === userInFollowing.id)) {
        notInLists.push(userInFollowing);
      }
    }

    if (notInLists.length === 0) {
      message = 'Congrats! You have put all your followed users in lists.';
    } else {
      message = `You follow these users that you haven’t yet put in a list:<br><br>
            ${notInLists
              .map(
                (user) =>
                  `<img src="${user.avatar}" width="46" height="46" /><strong>${user.display_name}</strong><br><a href="https://${instance}/@${user.acct}">${user.acct}</a><br><br>${user.note}`,
              )
              .join('<hr>')}`;
    }
  }
</script>

{#if showForm}
  <form bind:this={form} on:submit|preventDefault={authenticate}>
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
  <div class="message">
    {@html message}
  </div>
  <div class="errors">
    {#each errors as error}
      <div>{@html error}</div>
    {/each}
  </div>
</main>
