import type { NextConfig } from "next";

// Sent on every response: the CRM must never be framed by another site (clickjacking), and browsers must not guess file types.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  redirects() {
    return [{source:"/automations",has:[{type:"query",key:"tab",value:"approvals"}],destination:"/approvals",permanent:false}];
  },
  allowedDevOrigins: [
    "172.20.10.11",
    "0s2dbn2j-3011.inc1.devtunnels.ms",
    "0s2dbn2j-3012.inc1.devtunnels.ms",
  ],
};

export default nextConfig;
