import { lookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { get } from "node:https";

const cache = new Map<string, { expires: number; addresses: LookupAddress[] }>();

function encryptedIPv4Lookup(hostname: string): Promise<LookupAddress[]> {
  // A public DNS query contains only the hostname, never an API key or password.
  // Using the resolver's IP avoids recursively depending on the stalled resolver.
  return new Promise((resolve, reject) => {
    const request = get({ hostname: "1.1.1.1", path: `/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      headers: { Accept: "application/dns-json" }, timeout: 5_000 }, (response) => {
      let body = "";
      response.on("error", reject);
      response.on("data", (chunk) => {
        body += chunk.toString();
        if (body.length > 65_536) request.destroy(new Error("DNS response too large"));
      });
      response.on("end", () => {
        try {
          const data = JSON.parse(body) as { Status: number; Answer?: { type: number; data: string; TTL: number }[] };
          const records = data.Answer?.filter((answer) => answer.type === 1 && isIP(answer.data) === 4) ?? [];
          if (response.statusCode !== 200 || data.Status !== 0 || !records.length) throw new Error("DNS lookup failed");
          const addresses = records.map((answer) => ({ address: answer.data, family: 4 }));
          const ttl = Math.max(0, Math.min(60, ...records.map((answer) => answer.TTL)));
          cache.set(hostname, { addresses, expires: Date.now() + ttl * 1000 });
          resolve(addresses);
        } catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("DNS lookup timed out")));
    request.on("error", reject);
  });
}

// Some hotspot resolvers return only RFC 6052 well-known-prefix addresses even
// when their NAT64 route is broken and the underlying IPv4 route works.
// Derive the address from the current DNS answer; never pin a provider IP.
export function nat64IPv4(address: string): string | null {
  if (isIP(address) !== 6) return null;
  let normalized: string;
  try { normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1); }
  catch { return null; }
  const match = /^64:ff9b::([a-f0-9]{1,4}):([a-f0-9]{1,4})$/i.exec(normalized);
  if (!match) return null;
  const high = parseInt(match[1], 16), low = parseInt(match[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
}

export function preferReachableAddresses(addresses: LookupAddress[]): LookupAddress[] {
  const translated = addresses.flatMap(({ address }) => {
    const ipv4 = nat64IPv4(address);
    return ipv4 ? [{ address: ipv4, family: 4 }] : [];
  });
  return [...new Map([...translated, ...addresses].map((item) => [`${item.family}:${item.address}`, item])).values()];
}

export const supabaseLookup: LookupFunction = (hostname, options, callback) => {
  let finished = false;
  let fallbackStarted = false;
  let systemFinished = false;
  let fallbackError: Error | undefined;
  const finish = (error: NodeJS.ErrnoException | null, addresses: LookupAddress[] = []) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (error) { callback(error, []); return; }
    const preferred = preferReachableAddresses(addresses).filter((item) => !options.family || item.family === options.family);
    if (!preferred.length) {
      callback(Object.assign(new Error("No usable DNS address"), { code: "ENOTFOUND" }), []);
    } else if (options.all) callback(null, preferred);
    else callback(null, preferred[0].address, preferred[0].family);
  };
  const fallback = () => {
    if (fallbackStarted || finished) return;
    fallbackStarted = true;
    void encryptedIPv4Lookup(hostname).then((addresses) => finish(null, addresses)).catch((error: Error) => {
      fallbackError = error;
      if (systemFinished) finish(error);
    });
  };
  const timer = setTimeout(fallback, 500);
  const cached = cache.get(hostname);
  if (cached && cached.expires > Date.now()) { finish(null, cached.addresses); return; }
  lookup(hostname, { all: true }, (error, addresses) => {
    systemFinished = true;
    if (!error) finish(null, addresses);
    else if (fallbackError) finish(error);
    else fallback();
  });
};
