
// used to startup the worker
// get the config path from the args sent to the worker
const configArg = process.argv.find(a => a.startsWith('--config='));
if (!configArg) {
  throw new Error('Fork child process missing --config argument for worker');
}
const configStr = configArg.split('=')[1];
const config = JSON.parse(configStr);

// create our runner
// inject the node sys util and app's config path
const nodeSysWorker = require('./node-sys-worker');
const runner = nodeSysWorker.createRunner(config);
nodeSysWorker.attachMessageHandler(process, runner);
