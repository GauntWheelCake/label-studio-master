require('dotenv').config();

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { EnvironmentPlugin } = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const RELEASE = require('./release').getReleaseName();

const LOCAL_ENV = {
  NODE_ENV: "development",
  CSS_PREFIX: "ls-",
  RELEASE_NAME: RELEASE,
};

const devtool = process.env.NODE_ENV === 'production' ? "source-map" : "cheap-module-source-map";

const output = {
  path: path.resolve(__dirname, "dist", "react-app"),
  filename: 'index.js',
};

const plugins = [
  new MiniCssExtractPlugin(),
  new EnvironmentPlugin(LOCAL_ENV),
];

const optimizer = {};

if (process.env.NODE_ENV === 'production') {
  optimizer.minimize = true;
  // CSS 压缩暂时禁用：当前 cssnano 4.x 与 postcss 8.x 不兼容，
  // 会导致 postcss-discard-overridden 抛出 "unprefixed" 错误。
  // JS 仍会由 TerserPlugin 压缩；CSS 只是未做最小化，功能正常。
  optimizer.minimizer = [new TerserPlugin()];
  optimizer.runtimeChunk = false;
  optimizer.splitChunks = {
    chunks: 'async',
  };
}

module.exports = {
  devtool: devtool,
  mode: process.env.NODE_ENV || "development",
  entry: "./src/index.js",
  output: output,
  plugins: plugins,
  optimization: optimizer,
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/i,
        enforce: "pre",
        exclude: /node_modules/,
        use: [
          'babel-loader',
          'source-map-loader',
        ],
      },
      {
        test: /\.tsx?$/i,
        enforce: "pre",
        exclude: /node_modules/,
        use: [
          'babel-loader',
          'source-map-loader',
        ],
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.styl$/i,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              sourceMap: true,
              modules: {
                localIdentName: "ls-[local]",
              },
            },
          },
          {
            loader: "stylus-loader",
            options: {
              sourceMap: true,
              stylusOptions: {
                import: [
                  path.resolve(__dirname, './src/themes/default/colors.styl'),
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.svg$/,
        use: [{
          loader: '@svgr/webpack',
          options: {
            ref: true,
            svgoConfig: {
              plugins: {
                removeViewBox: false,
              },
            },
          },
        }],
      },
    ],
  },
};
