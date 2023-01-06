# Listodon

Checks if everyone you follow on Mastodon has been put into a List.

For people who like to read about different topics at different times. E.g. you could have a
Politics list and a Tech list, so your politics and tech don’t get interingled in your home
timeline.

## Developing

Make and install a self-signed certificate with the domain name `listodon.local`
for running https on localhost. I don’t remember how I did this.

Add this to `/etc/hosts`:

```
127.0.0.1 listodon.local
```

Run `pnpm dev` to run the local server.

## Building

```bash
npm run build
```

You can preview the production build with `npm run preview`.
