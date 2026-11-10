import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
