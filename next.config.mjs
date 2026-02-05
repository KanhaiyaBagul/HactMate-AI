/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Potentially fixing tldraw/React 19 conflicts
  swcMinify: false,       // Disable minification to prevent build-time breakage of libraries
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  // Ensure we don't have experimental features breaking things
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
}

export default nextConfig
