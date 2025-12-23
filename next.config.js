/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopack: false,
  },
  transpilePackages: [],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Native modules should not be bundled
      config.externals = [
        ...(config.externals || []),
        (context, request, callback) => {
          if (/duckdb\.node$/.test(request || '')) {
            return callback(null, `commonjs ${request}`);
          }
          if (/node-bindings/.test(request || '')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        }
      ];
    }
    return config;
  }
};

module.exports = nextConfig;
