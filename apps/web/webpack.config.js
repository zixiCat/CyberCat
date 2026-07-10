const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { NxReactWebpackPlugin } = require('@nx/react/webpack-plugin');
const { codeInspectorPlugin } = require('code-inspector-plugin');

const { join } = require('path');

const backendUnavailableMessage = JSON.stringify({
  message: 'CyberCat service is unavailable. Start the service on http://localhost:3333 and retry.',
});

const isSseRequest = (req) => {
  const acceptHeader = req.headers?.accept;

  return (typeof acceptHeader === 'string' && acceptHeader.includes('text/event-stream'))
    || req.url?.includes('/stream');
};

const writeProxyUnavailableResponse = (req, res) => {
  if (res.headersSent) {
    return;
  }

  if (isSseRequest(req)) {
    res.writeHead(503, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'close',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    res.end(`event: error\ndata: ${backendUnavailableMessage}\n\n`);
    return;
  }

  res.writeHead(503, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(backendUnavailableMessage);
};

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
  },
  devServer: {
    port: 4200,
    proxy: [
      {
        context: ['/api'],
        logLevel: 'silent',
        target: 'http://localhost:3333',
        on: {
          error: (_err, req, res) => {
            writeProxyUnavailableResponse(req, res);
          },
        },
        pathRewrite: { '^/api': '' },
      },
    ],
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
      htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
    },
  },
  plugins: [
    new NxAppWebpackPlugin({
      tsConfig: './tsconfig.app.json',
      compiler: 'babel',
      main: './src/main.tsx',
      index: './src/index.html',
      baseHref: '/',
      assets: ["./src/favicon.ico", "./src/assets"],
      styles: ["./src/styles.css"],
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
