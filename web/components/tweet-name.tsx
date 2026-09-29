const SITE_URL = "https://usdomains.xyz";

export function tweetNameHref(label: string) {
  const text = `Just claimed ${label}.usd on Arc 💵\n\nMy name. My wallet. My piece of the onchain dollar economy.\n\n${SITE_URL}`;
  const params = new URLSearchParams({ text });
  return `https://x.com/intent/tweet?${params.toString()}`;
}

export function TweetName({ label }: { label: string }) {
  return (
    <a className="primary tweet-name" href={tweetNameHref(label)} target="_blank" rel="noopener noreferrer">
      <XIcon />
      Tweet my domain
    </a>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.47 6.77 14.7 1H13.4L8.89 5.88 5.28 1H1.1l5.49 7.9L1.1 15h1.3l4.8-5.52L10.72 15h4.18L9.47 6.77Zm-1.7 1.95-.56-.79L2.87 1.91h1.9l3.57 5.05.56.79 4.64 6.56h-1.9L7.77 8.72Z"
      />
    </svg>
  );
}
