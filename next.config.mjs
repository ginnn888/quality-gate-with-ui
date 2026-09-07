/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The install routes read the vendored Automated Quality Gate files at runtime
  // with `fs`, so they must be bundled into those serverless functions.
  outputFileTracingIncludes: {
    "/api/installations": ["./vendor/**"],
    "/api/installations/[owner]/[repo]": ["./vendor/**"],
  },
};

export default nextConfig;
