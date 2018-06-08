const fs = require('fs-extra');
const path = require('path');
const webpack = require('webpack');

const ROOT_DIR = path.join(__dirname, '..');
const BUNDLES_SRC_DIR = path.join(ROOT_DIR, 'src', 'sys', 'node', 'bundles');
const BUNDLES_DST_DIR = path.join(ROOT_DIR, 'dist', 'sys', 'node');

bundle('node-fetch.js');
bundle('node-sys-util.js');


function bundle(entryFileName) {
  webpack({
    entry: path.join(BUNDLES_SRC_DIR, entryFileName),
    output: {
      path: path.join(BUNDLES_DST_DIR),
      filename: entryFileName,
      libraryTarget: 'commonjs'
    },
    target: 'node',
    externals: {
      'crypto': 'crypto',
      'fs': 'fs',
      'os': 'os',
      'path': 'path',
      'uglify-es': 'uglify-es',
      'url': 'url',
      'workbox-build': 'workbox-build'
    },
    mode: 'production',
    optimization: {
      minimize: false
    }
  }, (err, stats) => {
    if (err) {
      console.error(err.stack || err);
      if (err.details) {
        console.error(err.details);
      }
      return;
    }

    const info = stats.toJson();

    if (stats.hasErrors()) {
      info.errors.forEach(err => {
        console.error(err);
      });
    } else {
      console.log(`✅ sys.node.util: ${entryFileName}`);
    }
  });
}
