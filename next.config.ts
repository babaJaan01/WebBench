import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.wgsl$/,
      type: 'asset/source'
    });
    
    return config;
  },
  turbopack: {
    // Treat *.wgsl shader files as raw text during development with Turbopack
    rules: {
      '*.wgsl': {
        loaders: ['raw-loader'],
        as: '.js',
      },
    },
  },
};

export default nextConfig;
