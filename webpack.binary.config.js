const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const commonConfig = {
  mode: 'production',
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env', { targets: { node: '18' } }]],
          },
        },
      },
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.mjs', '.json', '.node'],
    alias: {
      // Force bundling of AWS SDK
      '@aws-sdk/client-s3': path.resolve(__dirname, 'node_modules/@aws-sdk/client-s3'),
      '@smithy/node-http-handler': path.resolve(__dirname, 'node_modules/@smithy/node-http-handler'),
    },
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
          keep_fnames: true,
        },
      }),
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
  ],
};

module.exports = [
  // S3DB CLI Configuration
  {
    ...commonConfig,
    entry: './bin/s3db-cli.js',
    output: {
      path: path.resolve(__dirname, 'build-binaries'),
      filename: 's3db-bundled.js',
      library: {
        type: 'commonjs2',
      },
    },
    externals: {
      // Don't externalize anything - bundle everything
    },
  },
  // S3DB MCP Server Configuration
  {
    ...commonConfig,
    entry: './mcp/server.js',
    output: {
      path: path.resolve(__dirname, 'build-binaries'),
      filename: 's3db-mcp-bundled.js',
      library: {
        type: 'commonjs2',
      },
    },
    externals: {
      // Don't externalize anything - bundle everything
    },
  },
];