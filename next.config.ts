import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandboxed live-preview proxy to load dev resources (HMR/chunks).
  // If the preview host changes, add the new host from the dev-log warning here.
  allowedDevOrigins: ['3000-igh7v01pnm13mt4ok87xr.e2b.app'],
};

export default nextConfig;
