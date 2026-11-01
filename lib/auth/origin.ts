// The development tunnel terminates HTTPS and forwards requests to local HTTP.
export function requestOrigin(req: Request) {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded && /^[a-z0-9.-]+(?::\d+)?$/i.test(forwarded)) {
    const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http" : "https";
    return new URL(`${protocol}://${forwarded}`).origin;
  }
  return new URL(req.url).origin;
}
