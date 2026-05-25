import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Backend self-host en Hetzner (Supabase Storage). Las fotos
        // sincronizadas con watermark se sirven desde aquí.
        protocol: "https",
        hostname: "crm.bcousinoprop.com",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
