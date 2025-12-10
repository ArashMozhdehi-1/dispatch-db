module.exports = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
  transpilePackages: ['mapbox-gl'],
  // Disable Next.js development indicator
  // Disable Next.js development indicator
  devIndicators: false,
};


