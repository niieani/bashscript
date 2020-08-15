const webpack = require('webpack')
const MonacoEditorWebpackPlugin = require('monaco-editor-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ProgressPlugin = require('webpack/lib/ProgressPlugin')
const path = require('path')
const {WebpackPluginServe: Serve} = require('webpack-plugin-serve')

const production = process.env.NODE_ENV === 'production'
const outputPath = path.resolve(__dirname, 'docs')
const argv = require('webpack-nano/argv')
const {watch} = argv

module.exports = {
  mode: production ? 'production' : 'development',
  devtool: production ? 'source-map' : 'eval',
  entry: ['./repl', 'webpack-plugin-serve/client'],
  // entry: {
  //   repl: './repl',
  //   ...(watch
  //     ? {
  //         client: 'webpack-plugin-serve/client',
  //       }
  //     : {}),
  // },
  output: {
    globalObject: 'self',
    path: outputPath,
  },
  resolve: {
    alias: {
      path: 'path-browserify',
      crypto: 'crypto-browserify',
      vm: 'vm-browserify',
      stream: 'stream-browserify',
      process: 'process/browser',
      module: false,
      fs: false,
    },
    extensions: ['.ts', '.mjs', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: [/\/node_modules\//],
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              onlyCompileBundledFiles: true,
              compilerOptions: {
                module: 'esnext',
                rootDir: './',
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          // 'postcss-loader',
        ],
      },
      {
        test: /\.ttf$/,
        use: ['file-loader'],
      },
    ],
  },
  plugins: [
    // new webpack.DefinePlugin({
    //   process: `undefined`,
    // }),
    new webpack.WatchIgnorePlugin({
      paths: [
        path.resolve(__dirname, 'docs'),
        path.resolve(__dirname, 'fixtures'),
      ],
    }),
    new MonacoEditorWebpackPlugin(webpack, {
      languages: ['typescript', 'shell'],
      features: [
        'bracketMatching',
        'caretOperations',
        'find',
        'hover',
        'multicursor',
        'parameterHints',
        'rename',
        'smartSelect',
        'suggest',
        'wordHighlighter',
        'coreCommands',
        'findController',
      ],
    }),
    new HtmlWebpackPlugin({
      // title: 'BashScript REPL',
      template: './repl/index.html',
      // chunks: ['repl'],
    }),
    // new webpack.IgnorePlugin(/^((fs)|(path)|(os)|(crypto)|(source-map-support))$/, /vs[/\\]language[/\\]typescript[/\\]lib/),
    new webpack.IgnorePlugin({
      resourceRegExp: /vs[/\\]language[/\\]typescript[/\\]lib/,
    }),
    new ProgressPlugin(),
    new Serve({static: outputPath}),
  ],
  watch: !!watch,
}
