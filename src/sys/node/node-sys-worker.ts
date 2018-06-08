import * as d from '../../declarations';
import { attachMessageHandler } from './worker-farm/worker';
import { BaseLogger } from '../../util/logger/base-logger';
import { getCompilerCtx } from '../../compiler/build/compiler-ctx';
import { normalizePath } from '../../compiler/util';
import { ShadowCss } from '../../compiler/style/shadow-css';
import { transpileFileWorker } from '../../compiler/transpile/transpile-file-worker';
import { transpileProgramWorker } from '../../compiler/transpile/transpile-program-worker';

import * as path from 'path';


export class NodeSystemWorker {
  config: d.Config;
  compilerCtx: d.CompilerCtx;
  sysUtil: any;

  constructor(config: d.Config) {
    this.sysUtil = require(path.join(__dirname, '..', '..', '..', 'dist', 'sys', 'node', 'node-sys-util'));
    const nodeSysMain = require(path.join(__dirname, '..', '..', '..', 'dist', 'sys', 'node', 'node-sys-main'));

    this.config = config;
    this.config.sys = new nodeSysMain.NodeSystem();
    this.config.logger = new WorkerLogger();

    this.compilerCtx = getCompilerCtx(this.config);
  }

  async autoprefixCss(input: string, opts: any) {
    if (opts == null || typeof opts !== 'object') {
      opts = {
        browsers: [
          'last 2 versions',
          'iOS >= 9',
          'Android >= 4.4',
          'Explorer >= 11',
          'ExplorerMobile >= 11'
        ],
        cascade: false,
        remove: false
      };
    }
    const prefixer = this.sysUtil.postcss([this.sysUtil.autoprefixer(opts)]);
    const result = await prefixer.process(input, {
      map: false,
      from: undefined
    });
    return result.css as string;
  }

  gzipSize(text: string) {
    return this.sysUtil.gzipSize(text);
  }

  minifyCss(input: string, filePath?: string, opts: any = {}) {
    let minifyInput: any;

    if (typeof filePath === 'string') {
      filePath = normalizePath(filePath);
      minifyInput = {
        [filePath]: {
          styles: input
        }
      };
    } else {
      minifyInput = input;
    }

    const cleanCss = new this.sysUtil.cleanCss(opts);
    const result = cleanCss.minify(minifyInput);
    const diagnostics: d.Diagnostic[] = [];

    if (result.errors) {
      result.errors.forEach((msg: string) => {
        diagnostics.push({
          header: 'Minify CSS',
          messageText: msg,
          level: 'error',
          type: 'build'
        });
      });
    }

    if (result.warnings) {
      result.warnings.forEach((msg: string) => {
        diagnostics.push({
          header: 'Minify CSS',
          messageText: msg,
          level: 'warn',
          type: 'build'
        });
      });
    }

    return {
      output: result.styles,
      sourceMap: result.sourceMap,
      diagnostics: diagnostics
    };
  }

  minifyJs(input: string, opts?: any) {
    const result = this.sysUtil.uglifyEs.minify(input, opts);
    const diagnostics: d.Diagnostic[] = [];

    if (result.error) {
      diagnostics.push({
        header: 'Minify JS',
        messageText: result.error.message,
        level: 'error',
        type: 'build'
      });
    }

    return {
      output: (result.code as string),
      sourceMap: result.sourceMap,
      diagnostics: diagnostics
    };
  }

  scopeCss(cssText: string, scopeAttribute: string, hostScopeAttr: string, slotScopeAttr: string) {
    const sc = new ShadowCss();
    return sc.shimCssText(cssText, scopeAttribute, hostScopeAttr, slotScopeAttr);
  }

  transpileFile(tsFilePath: string, tsSourceText: string) {
    return transpileFileWorker(this.config, this.compilerCtx, tsFilePath, tsSourceText);
  }

  transpileProgram(tsFilePaths: string[]) {
    return transpileProgramWorker(this.config, this.compilerCtx, tsFilePaths);
  }

}


class WorkerLogger extends BaseLogger {
  info(msg: string) {
    throw new Error(`WorkerLogger should print info logs: ${msg}`);
  }
  warn(msg: string) {
    throw new Error(`WorkerLogger should print warnings: ${msg}`);
  }
  error(msg: string) {
    throw new Error(`WorkerLogger should print errors: ${msg}`);
  }
  debug() { /* just ignore debug logs */ }
}


export function createRunner(config: d.Config) {
  const instance: any = new NodeSystemWorker(config);

  return (methodName: string, args: any[]) => {
    // get the method on the loaded module
    const workerFn = instance[methodName];
    if (typeof workerFn !== 'function') {
      throw new Error(`invalid method: ${methodName}`);
    }

    // call the method on the loaded module
    const rtn = workerFn.apply(instance, args);
    if (rtn == null || typeof rtn.then !== 'function') {
      // sync function returned void or a value that's not a promise
      return Promise.resolve(rtn);
    }

    return rtn as Promise<any>;
  };
}


export { attachMessageHandler };
