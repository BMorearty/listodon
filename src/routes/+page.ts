import type { PageLoad } from './$types';

// Don't ssr this page becuase it will flash the Mastodon picture for a moment.
export const ssr = false;

export const load: PageLoad = ({ fetch }) => {
  return { fetch };
};
