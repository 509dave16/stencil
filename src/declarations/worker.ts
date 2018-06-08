
export interface WorkerTask {
  taskId?: number;
  methodName: string;
  args: any[];
  isLongRunningTask: boolean;
  resolve: (val: any) => any;
  reject: (msg: string) => any;
  timer?: any;
}

export interface WorkerProcess {
  workerId: number;
  taskIds: number;
  send?(msg: WorkerMessageData): void;
  kill?(signal?: string): void;
  tasks?: WorkerTask[];
  totalTasksAssigned?: number;
  exitCode?: number;
  isExisting?: boolean;
}

export interface WorkerMessageData {
  workerId?: number;
  taskId?: number;
  modulePath?: string;
  methodName?: string;
  args?: any[];
  value?: any;
  exitProcess?: boolean;
  error?: {
    message?: string;
    stack?: string;
    type?: string;
    name?: string;
  };
}

export type WorkerRunner = (methodName: string, args: any[]) => Promise<any>;
