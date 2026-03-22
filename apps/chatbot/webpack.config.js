const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { NxReactWebpackPlugin } = require('@nx/react/webpack-plugin');
const { join } = require('path');

const { codeInspectorPlugin } = require('code-inspector-plugin');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    publicPath: '',
    clean: true,
  },
  devServer: {
    port: 4100,
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
      htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, Content-Type, Authorization, X-Title',
    },
    proxy: [
      {
        context: ['/v1'],
        target: 'http://127.0.0.1:8001',
        secure: false,
        changeOrigin: true,
      },
    ],
  },
  plugins: [
    new NxAppWebpackPlugin({
      tsConfig: './tsconfig.app.json',
      compiler: 'babel',
      main: './src/main.tsx',
      index: './src/index.html',
      baseHref: '',
      assets: [
        './src/assets',
        {
          input: join(__dirname, '../../'),
          glob: 'CyberCat.png',
          output: '.',
        },
      ],
      styles: ['./src/styles.css'],
      outputHashing: process.env['NODE_ENV'] === 'production' ? 'all' : 'none',
      optimization: process.env['NODE_ENV'] === 'production',
    }),
    new NxReactWebpackPlugin({
      // Uncomment this line if you don't want to use SVGR
      // See: https://react-svgr.com/
      // svgr: false
    }),
    codeInspectorPlugin({
      bundler: 'webpack',
    }),
  ],
};
