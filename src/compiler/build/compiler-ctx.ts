import * as d from '../../declarations';
import { BuildEvents } from '../events';
import { Cache } from '../cache';
import { InMemoryFileSystem } from '../../util/in-memory-fs';


export function getCompilerCtx(config: d.Config, compilerCtx?: d.CompilerCtx) {
  // reusable data between builds
  compilerCtx = compilerCtx || {};
  compilerCtx.fs = compilerCtx.fs || new InMemoryFileSystem(config.sys.fs, config.sys.path);
  compilerCtx.cache = compilerCtx.cache || new Cache(config, new InMemoryFileSystem(config.sys.fs, config.sys.path), config.sys.tmpdir());
  compilerCtx.events = compilerCtx.events || new BuildEvents(config);
  compilerCtx.appFiles = compilerCtx.appFiles || {};
  compilerCtx.moduleFiles = compilerCtx.moduleFiles || {};
  compilerCtx.collections = compilerCtx.collections || [];
  compilerCtx.resolvedCollections = compilerCtx.resolvedCollections || {};
  compilerCtx.compiledModuleJsText = compilerCtx.compiledModuleJsText || {};
  compilerCtx.compiledModuleLegacyJsText = compilerCtx.compiledModuleLegacyJsText || {};

  if (typeof compilerCtx.activeBuildId !== 'number') {
    compilerCtx.activeBuildId = -1;
  }

  return compilerCtx;
}


export function resetCompilerCtx(compilerCtx: d.CompilerCtx) {
  compilerCtx.fs.clearCache();
  compilerCtx.cache.clear();
  compilerCtx.appFiles = {};
  compilerCtx.moduleFiles = {};
  compilerCtx.collections.length = 0;
  compilerCtx.resolvedCollections = {};
  compilerCtx.compiledModuleJsText = {};
  compilerCtx.compiledModuleLegacyJsText = {};
  compilerCtx.tsconfig = null;

  // do NOT reset 'hasSuccessfulBuild'
}
