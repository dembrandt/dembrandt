import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

function ranges(v4: Array<[string, number]>, v6: Array<[string, number]>): BlockList {
  const list = new BlockList();
  for (const [net, bits] of v4) list.addSubnet(net, bits, 'ipv4');
  for (const [net, bits] of v6) list.addSubnet(net, bits, 'ipv6');
  return list;
}

const LOCAL_V4: Array<[string, number]> = [
  ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
];
const LOCAL_V6: Array<[string, number]> = [['::1', 128], ['fc00::', 7], ['fe80::', 10]];
const LOCAL = ranges(LOCAL_V4, LOCAL_V6);
// 198.18.0.0/15 is left out: VPN clients answer every public name from it.
const PRIVATE = ranges(
  [...LOCAL_V4, ['0.0.0.0', 8], ['192.0.0.0', 24], ['224.0.0.0', 3]],
  [...LOCAL_V6, ['::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['fec0::', 10], ['ff00::', 8]],
);

export type Resolve = (hostname: string) => Promise<string[]>;

const resolveAll: Resolve = async (hostname) => (await lookup(hostname, { all: true })).map((a) => a.address);

// A DNS64 network adds 64:ff9b::<ipv4> to public names, so the embedded address is the one to judge.
function embeddedV4(address: string): string {
  if (isIP(address) !== 6) return address;
  const m = /^\[64:ff9b::(?:(?:([0-9a-f]{1,4}):)?([0-9a-f]{1,4}))?\]$/.exec(new URL(`http://[${address.split('%')[0]}]`).hostname);
  if (!m) return address;
  const [hi, lo] = [m[1] ?? '0', m[2] ?? '0'].map((h) => parseInt(h, 16));
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

function inRanges(list: BlockList, raw: string): boolean {
  const address = embeddedV4(raw);
  return list.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

export function isPrivateAddress(address: string): boolean {
  return !isIP(address) || inRanges(PRIVATE, address);
}

async function addressesOf(url: string, resolve: Resolve, signal?: AbortSignal | null): Promise<string[]> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return [host];
  if (!signal) return resolve(host);
  signal.throwIfAborted();
  return new Promise((ok, fail) => {
    signal.addEventListener('abort', () => fail(signal.reason), { once: true });
    resolve(host).then(ok, fail);
  });
}

const MAX_REDIRECTS = 5;

/**
 * Fetches a URL a page named, from node, where the browser's CORS does not apply. A public page may only name
 * public addresses, on every redirect; a page whose every address is local may name either.
 */
export async function fetchFromPage(
  url: string,
  pageUrl: string,
  init: RequestInit = {},
  { fetchImpl = fetch, resolve = resolveAll }: { fetchImpl?: typeof fetch; resolve?: Resolve } = {},
): Promise<Response> {
  const page = await addressesOf(pageUrl, resolve, init.signal);
  const pageIsLocal = page.length > 0 && page.every((a) => isIP(a) && inRanges(LOCAL, a));
  let target = new URL(url).href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:/.test(target)) throw new Error('only http and https are fetched');
    if (!pageIsLocal) {
      const found = await addressesOf(target, resolve, init.signal);
      if (found.length === 0 || found.some(isPrivateAddress)) throw new Error('a public page named a private address');
    }
    const res = await fetchImpl(target, { ...init, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    await res.body?.cancel();
    target = new URL(location, target).href;
  }
  throw new Error('too many redirects');
}
