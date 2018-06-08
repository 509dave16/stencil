import * as d from '../../declarations';
import { catchError } from '../util';
import { createBundle, writeEsModules, writeEsmEs5Modules, writeLegacyModules  } from './rollup-bundle';
import { minifyJs } from '../minifier';


export async function generateBundleModules(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, entryModules: d.EntryModule[]) {
  const jsModuleMap: d.JSModuleMap = {
    esm: {},
    es5: {},
    esmEs5: {}
  };

  if (entryModules.length === 0) {
    // no entry modules, so don't bother
    return jsModuleMap;
  }

  try {
    // run rollup, but don't generate yet
    // returned rollup bundle can be reused for es module and legacy
    const rollupBundle = await createBundle(config, compilerCtx, buildCtx, entryModules);
    if (buildCtx.shouldAbort()) {
      // rollup errored, so let's not continue
      return jsModuleMap;
    }

    // bundle using only es modules and dynamic imports
    jsModuleMap.esm = await writeEsModules(config, rollupBundle);

    buildCtx.bundleBuildCount = Object.keys(jsModuleMap.esm).length;

    if (config.buildEs5) {
      // only create legacy modules when generating es5 fallbacks
      // bundle using commonjs using jsonp callback
      jsModuleMap.es5 = await writeLegacyModules(config, rollupBundle, entryModules);
    }

    if (config.outputTargets.some(o => o.type === 'dist')) {
      jsModuleMap.esmEs5 = await writeEsmEs5Modules(config, rollupBundle);
    }

    if (config.minifyJs) {
      await minifyChunks(config, compilerCtx, buildCtx, jsModuleMap);
    }

  } catch (err) {
    catchError(buildCtx.diagnostics, err);
  }

  return jsModuleMap;
}


async function minifyChunks(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, jsModuleMap: d.JSModuleMap) {
  const promises = Object.keys(jsModuleMap).map((moduleType: 'esm' | 'es5' | 'esmEs5') => {
    const jsModuleList = jsModuleMap[moduleType];

    const promises = Object.keys(jsModuleList)
      .filter(m => !m.startsWith('entry:'))
      .map(chunkKey => jsModuleList[chunkKey])
      .map(async chunk => {
        if (!chunk || !chunk.code) {
          return;
        }

        const sourceTarget = (moduleType === 'es5' || moduleType === 'esmEs5') ? 'es5' : 'es2017';
        const minifyJsResults = await minifyJs(config, compilerCtx, chunk.code, sourceTarget, true);

        if (minifyJsResults.diagnostics.length) {
          minifyJsResults.diagnostics.forEach(d => {
            buildCtx.diagnostics.push(d);
          });

        } else {
          chunk.code = minifyJsResults.output;
        }
      });

    return Promise.all(promises);
  });

  return Promise.all(promises);
}
