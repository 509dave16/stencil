const fs = require('fs-extra');
const path = require('path');
const rollup = require('rollup');
const transpile = require('./transpile');


const ROOT_DIR = path.join(__dirname, '..');
const TRANSPILED_DIR = path.join(ROOT_DIR, 'dist', 'transpiled-sys-node');
const SRC_DIR = path.join(TRANSPILED_DIR, 'sys', 'node');
const DST_DIR = path.join(ROOT_DIR, 'dist', 'sys', 'node');

const BUILD_ID = getBuildId();

const success = transpile(path.join('..', 'src', 'sys', 'node', 'tsconfig.json'));

if (success) {
  fs.ensureDirSync(path.join(ROOT_DIR, 'dist', 'sys', 'node'));

  bundleNodeSysMain('node-sys-main.js');
  bundleNodeSysMain('node-sys-worker.js');
  bundleNodeSysMain('node-logger.js');

  fs.copyFile(
    path.join(ROOT_DIR, 'src', 'sys', 'node', 'bundles', 'start-worker.js'),
    path.join(ROOT_DIR, 'dist', 'sys', 'node', 'start-worker.js')
  );

  function bundleNodeSysMain(fileName) {
    const inputPath = path.join(SRC_DIR, fileName);
    const outputPath = path.join(DST_DIR, fileName);

    rollup.rollup({
      input: inputPath,
      external: [
        'crypto',
        'child_process',
        'fs',
        'os',
        'path',
        'typescript',
        'url'
      ],
      onwarn: (message) => {
        if (message.code === 'THIS_IS_UNDEFINED') return;
        if (message.code === 'UNUSED_EXTERNAL_IMPORT') return;
        console.error(inputPath, message);
      }

    }).then(bundle => {

      return bundle.generate({
        format: 'cjs',
        file: outputPath

      }).then(output => {
        try {
          let outputText = output.code;
          outputText = outputText.replace(/__BUILD_ID__/g, BUILD_ID);
          fs.writeFileSync(outputPath, outputText);

        } catch (e) {
          console.error(e);
        }

      }).then(() => {
        console.log(`✅ sys.node: ${fileName}`);

      }).catch(err => {
        console.log(`build sys.node error: ${err}`);
        process.exit(1);
      });

    }).catch(err => {
      console.log(`build sys.node error: ${err}`);
      process.exit(1);
    });
  }

  process.on('exit', (code) => {
    fs.removeSync(TRANSPILED_DIR);
  });

}

function getBuildId() {
  const d = new Date();

  let buildId = ('0' + d.getUTCFullYear()).slice(-2);
  buildId += ('0' + d.getUTCMonth()).slice(-2);
  buildId += ('0' + d.getUTCDate()).slice(-2);
  buildId += ('0' + d.getUTCHours()).slice(-2);
  buildId += ('0' + d.getUTCMinutes()).slice(-2);
  buildId += ('0' + d.getUTCSeconds()).slice(-2);

  return buildId;
}