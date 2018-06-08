import * as d from '../../../declarations';
import { fork } from 'child_process';


export class WorkerFarm {
  modulePath: string;
  config: d.Config;
  workerModule: any;
  workers: d.WorkerProcess[] = [];
  taskQueue: d.WorkerTask[] = [];
  isExisting = false;
  logger: d.Logger;
  singleThreadRunner: d.WorkerRunner;

  constructor(modulePath: string, config: d.Config) {
    this.modulePath = modulePath;
    this.config = config;

    this.logger = {
      error: function() {
        console.error.apply(console, arguments);
      }
    } as any;

    if (config.maxConcurrentWorkers > 1) {
      this.startWorkers();

    } else {
      this.workerModule = require(modulePath);
      this.singleThreadRunner = new this.workerModule.createRunner(config);
    }
  }

  run(methodName: string, args?: any[], isLongRunningTask = false) {
    if (this.isExisting) {
      return Promise.reject(`process exited`);
    }

    if (this.singleThreadRunner) {
      return this.singleThreadRunner(methodName, args);
    }

    return new Promise<any>((resolve, reject) => {
      const task: d.WorkerTask = {
        methodName: methodName,
        args: args,
        isLongRunningTask: isLongRunningTask,
        resolve: resolve,
        reject: reject
      };
      this.taskQueue.push(task);
      this.processTaskQueue();
    });
  }

  startWorkers() {
    for (let workerId = 0; workerId < this.config.maxConcurrentWorkers; workerId++) {
      const worker = this.createWorker(workerId);

      worker.tasks = [];
      worker.totalTasksAssigned = 0;

      this.workers.push(worker);
    }

    process.once('exit', this.destroy.bind(this));
  }

  createWorker(workerId: number) {
    const config = Object.assign({}, this.config);
    delete config.sys;
    delete config.logger;

    const argv = [
      `--config=${JSON.stringify(config)}`
    ];

    const options = {
      env: process.env,
      cwd: __dirname,
    };

    const childProcess = fork(this.modulePath, argv, options);

    const worker: d.WorkerProcess = {
      workerId: workerId,
      taskIds: 0,
      send: (msg: d.WorkerMessageData) => childProcess.send(msg),
      kill: () => childProcess.kill('SIGKILL')
    };

    childProcess.on('message', this.receiveMessageFromWorker.bind(this));

    childProcess.once('exit', code => {
      this.onWorkerExit(workerId, code);
    });

    childProcess.on('error', () => {/**/});

    return worker;
  }

  onWorkerExit(workerId: number, exitCode: number) {
    const worker = this.workers.find(w => w.workerId === workerId);
    if (!worker) {
      return;
    }

    worker.exitCode = exitCode;

    setTimeout(() => {
      const worker = this.workers.find(w => w.workerId === workerId);
      if (worker) {
        worker.tasks.forEach(task => {
          this.receiveMessageFromWorker({
            workerId: workerId,
            taskId: task.taskId,
            error: {
              message: `Worker exited. Canceled "${task.methodName}" task.`
            }
          });
        });
      }

      this.stopWorker(workerId);
    }, 10);
  }

  stopWorker(workerId: number) {
    const worker = this.workers.find(w => w.workerId === workerId);
    if (worker && !worker.isExisting) {
      worker.isExisting = true;

      worker.send({
        exitProcess: true
      });

      const tmr = setTimeout(() => {
        if (worker.exitCode == null) {
          worker.kill();
        }
      }, 100);

      tmr.unref && tmr.unref();

      const index = this.workers.indexOf(worker);
      if (index > -1) {
        this.workers.splice(index, 1);
      }
    }
  }

  receiveMessageFromWorker(msg: d.WorkerMessageData) {
    // message sent back from a worker process
    const worker = this.workers.find(w => w.workerId === msg.workerId);
    if (!worker) {
      this.logger.error(`Worker Farm: Received message for unknown worker (${msg.workerId})`);
      return;
    }

    const task = worker.tasks.find(w => w.taskId === msg.taskId);
    if (!task) {
      this.logger.error(`Worker Farm: Received message for unknown taskId (${msg.taskId}) for worker (${worker.workerId})`);
      return;
    }

    if (task.timer) {
      clearTimeout(task.timer);
    }

    const index = worker.tasks.indexOf(task);
    if (index > -1) {
      worker.tasks.splice(index, 1);
    }

    process.nextTick(() => {
      if (msg.error) {
        task.reject(msg.error.message);
      } else {
        task.resolve(msg.value);
      }

      // overkill yes, but let's ensure we've cleaned up this task
      task.args = null;
      task.reject = null;
      task.resolve = null;
      task.timer = null;
    });

    // allow any outstanding tasks to be processed
    this.processTaskQueue();
  }

  workerTimeout(workerId: number) {
    const worker = this.workers.find(w => w.workerId === workerId);
    if (!worker) {
      return;
    }

    worker.tasks.forEach(task => {
      this.receiveMessageFromWorker({
        taskId: task.taskId,
        workerId: workerId,
        error: {
          message: `worker timed out! Canceled "${task.methodName}" task`
        }
      });
    });

    this.stopWorker(workerId);
  }

  processTaskQueue() {
    while (this.taskQueue.length > 0) {
      const worker = nextAvailableWorker(this.workers, this.config.maxConcurrentTasksPerWorker);
      if (worker) {
        // we found a worker to send this task to
        this.send(worker, this.taskQueue.shift());

      } else {
        // no worker available ATM, we'll try again later
        break;
      }
    }
  }

  send(worker: d.WorkerProcess, task: d.WorkerTask) {
    if (!worker || !task) {
      return;
    }

    task.taskId = worker.taskIds++;

    worker.tasks.push(task);
    worker.totalTasksAssigned++;

    worker.send({
      workerId: worker.workerId,
      taskId: task.taskId,
      methodName: task.methodName,
      args: task.args
    });

    // no need to keep these args in memory at this point
    task.args = null;

    if (this.config.maxTaskTime !== Infinity) {
      task.timer = setTimeout(this.workerTimeout.bind(this, worker.workerId), this.config.maxTaskTime);
    }
  }

  destroy() {
    if (!this.isExisting) {
      this.isExisting = true;

      for (let i = this.workers.length - 1; i >= 0; i--) {
        this.stopWorker(this.workers[i].workerId);
      }
    }
  }

}


export function nextAvailableWorker(workers: d.WorkerProcess[], maxConcurrentTasksPerWorker: number) {
  const availableWorkers = workers.filter(w => {
    if (w.tasks.length >= maxConcurrentTasksPerWorker) {
      // do not use this worker if it's at its max
      return false;
    }

    if (w.tasks.some(t => t && t.isLongRunningTask)) {
      // one of the tasks for this worker is a long running task
      // so leave this worker alone and let it focus
      // basically so the many little tasks don't have to wait up on the long task
      return false;
    }

    // let's use this worker for this task
    return true;
  });

  if (availableWorkers.length === 0) {
    // all workers are pretty tasked at the moment, please come back later. Thank you.
    return null;
  }

  const sorted = availableWorkers.sort((a, b) => {
    // worker with the fewest active tasks first
    if (a.tasks.length < b.tasks.length) return -1;
    if (a.tasks.length > b.tasks.length) return 1;

    // all workers have the same number of active takss, so next sort
    // by worker with the fewest total tasks that have been assigned
    if (a.totalTasksAssigned < b.totalTasksAssigned) return -1;
    if (a.totalTasksAssigned > b.totalTasksAssigned) return 1;

    return 0;
  });

  return sorted[0];
}
