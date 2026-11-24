import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 127], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) PRIVATE.addSubnet(net, bits, 'ipv6');

export type Resolve = (hostname: string) => Promise<string[]>;

const resolveAll: Resolve = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return true;
  return PRIVATE.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

async function isPrivateUrl(url: string, resolve: Resolve): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await resolve(host);
  return addresses.length === 0 || addresses.some(isPrivateAddress);
}

const MAX_REDIRECTS = 5;

/**
 * Fetches a URL a page named, from node, where the browser's CORS does not apply. A public page may only name
 * public addresses, on every redirect; a page the user runs on a private address may name either.
 */
export async function fetchFromPage(
  url: string,
  pageUrl: string,
  init: RequestInit = {},
  { fetchImpl = fetch, resolve = resolveAll }: { fetchImpl?: typeof fetch; resolve?: Resolve } = {},
): Promise<Response> {
  const pageIsPrivate = await isPrivateUrl(pageUrl, resolve);
  let target = new URL(url).href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:/.test(target)) throw new Error('only http and https are fetched');
    if (!pageIsPrivate && await isPrivateUrl(target, resolve)) throw new Error('a public page named a private address');
    const res = await fetchImpl(target, { ...init, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    await res.body?.cancel();
    target = new URL(location, target).href;
  }
  throw new Error('too many redirects');
}
