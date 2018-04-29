const webpack = require('webpack')
const MonacoEditorWebpackPlugin = require('monaco-editor-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const HardSourceWebpackPlugin = require('hard-source-webpack-plugin')
const ProgressPlugin = require('webpack/lib/ProgressPlugin')
const path = require('path')

const production = process.env.NODE_ENV === 'production'

module.exports = {
  mode: production ? 'production' : 'development',
  devtool: production ? 'source-map' : 'eval',
  entry: {
    repl: './repl',
  },
  output: {
    globalObject: 'self',
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'docs')
  },
  resolve: {
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
              }
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          // 'postcss-loader',
        ],
      }
    ]
  },
  plugins: [
    new MonacoEditorWebpackPlugin(webpack, {
      languages: ['typescript'],
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
      ]
    }),
    new HtmlWebpackPlugin({
      // title: 'BashScript REPL',
      template: './repl/index.html',
      chunks: ['repl'],
    }),
    // new webpack.IgnorePlugin(/^((fs)|(path)|(os)|(crypto)|(source-map-support))$/, /vs[/\\]language[/\\]typescript[/\\]lib/),
    new webpack.IgnorePlugin(/vs[/\\]language[/\\]typescript[/\\]lib/),
    new HardSourceWebpackPlugin(),
    new ProgressPlugin(),
  ],
  node: {
    fs: 'empty',
    module: 'empty',
  }
}
