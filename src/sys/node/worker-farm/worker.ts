import * as d from '../../../declarations';


export function attachMessageHandler(process: NodeJS.Process, runner: d.WorkerRunner) {

  function handleMessageFromMain(receivedFromMain: d.WorkerMessageData) {
    if (receivedFromMain.exitProcess) {
      // main thread sent to have this worker exit, what a jerk
      process.exit(0);
      return;
    }

    // build a message to send back to main
    const sendToMain: d.WorkerMessageData = {
      workerId: receivedFromMain.workerId,
      taskId: receivedFromMain.taskId
    };

    // call the method on the loaded module
    // using the received task data
    try {
      const rtn = runner(receivedFromMain.methodName, receivedFromMain.args);

      rtn.then((value: any) => {
        // all good!
        sendToMain.value = value;
        process.send(sendToMain);

      }).catch((err: any) => {
        // rejected promise
        addErrorMsg(sendToMain, err);
        process.send(sendToMain);
      });

    } catch (e) {
      // method call had an error
      addErrorMsg(sendToMain, e);
      process.send(sendToMain);
    }
  }

  // handle receiving a message from the main process
  process.on('message', handleMessageFromMain);
}


function addErrorMsg(msg: d.WorkerMessageData, err: any) {
  // parse whatever error we got into a common
  // format to send back to the main process
  msg.error = {
    message: 'worker error'
  };

  if (typeof err === 'string') {
    msg.error.message = err;

  } else if (err) {
    if ((err as Error).message) {
      msg.error.message = (err as Error).message;
    }
    if ((err as Error).stack) {
      msg.error.stack = (err as Error).stack;
    }
    if ((err as Error).name) {
      msg.error.name = (err as Error).name;
    }
    if (err.type) {
      msg.error.type = err.type;
    }
  }
}
