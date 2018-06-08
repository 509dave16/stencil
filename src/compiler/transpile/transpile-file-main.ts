import * as d from '../../declarations';
import { getUserTsConfig } from './compiler-options';
import { normalizePath } from '../util';
import { parseCollectionNames } from '../collections/parse-collection-module';


export function transpileFilesMain(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, tsFilePaths: string[]) {
  const collectionNames: string[] = [];

  // fire up the typescript program
  const timespace = config.logger.createTimeSpan('transpileModules start', true);

  return new Promise(async (resolve, reject) => {
    const compilerOptions = await getUserTsConfig(config, compilerCtx);
    const queue: { tsFilePath: string; status: 'queued' | 'processing' | 'completed'; }[] = [];

    function drainQueue() {
      if (buildCtx.shouldAbort()) {
        resolve();
        return;
      }

      const queuedToBeProcessed = queue.filter(f => f.status === 'queued');

      queuedToBeProcessed.forEach(async f => {
        try {
          f.status = 'processing';

          const results = await transpileFile(config, compilerCtx, buildCtx, compilerOptions, f.tsFilePath);
          f.status = 'completed';

          results.localImports.forEach(localImport => {
            if (!(queue.some(f => f.tsFilePath === localImport))) {
              queue.push({
                tsFilePath: localImport,
                status: 'queued'
              });
            }
          });

          results.collectionNames.forEach(collectionName => {
            if (!collectionNames.includes(collectionName)) {
              collectionNames.push(collectionName);
            }
          });

          drainQueue();

        } catch (e) {
          reject(e);
        }
      });

      if (queue.every(f => f.status === 'completed')) {
        // done and done
        timespace.finish(`transpileModules finished`);
        resolve();
      }
    }

    tsFilePaths.forEach(tsFilePath => {
      queue.push({
        tsFilePath: tsFilePath,
        status: 'queued'
      });
    });

    drainQueue();

  }).then(() => {
    return parseCollectionNames(config, compilerCtx, config.rootDir, collectionNames);
  });
}


export async function transpileFile(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, compilerOptions: any, tsFilePath: string) {
  let results: d.TranspileFileResults;

  tsFilePath = normalizePath(tsFilePath);

  const tsSourceText = await compilerCtx.fs.readFile(tsFilePath);

  const cacheKey = compilerCtx.cache.createKey('transpileFile', compilerOptions, tsSourceText);
  const cachedContent = await compilerCtx.cache.get(cacheKey);
  if (cachedContent != null) {
    // we have cached data
    results = JSON.parse(cachedContent);

  } else {
    // do not have cached data
    results = await config.sys.transpileFile(tsFilePath, tsSourceText);

    if (typeof results.outputText !== 'string' || !Array.isArray(results.diagnostics) || !Array.isArray(results.externalImports) || !Array.isArray(results.localImports)) {
      // major problem, let's not continue
      throw new Error(`transpileFile, invalid results: ${results}`);
    }

    if (results.diagnostics.length > 0) {
      // we've got diagnostics, so let's not continue
      buildCtx.diagnostics.push(...results.diagnostics);
      return results;
    }

    // keep track of how many files we transpiled (great for debugging/testing)
    buildCtx.transpileBuildCount++;

    // we've got good data, let's cache for next time
    await compilerCtx.cache.put(cacheKey, JSON.stringify({
      outputText: results.outputText,
      externalImports: results.externalImports,
      localImports: results.localImports,
      cmpMeta: results.cmpMeta
    } as d.TranspileFileResults));
  }

  // cool, let's make sure this data is in our module files context
  const moduleFile = compilerCtx.moduleFiles[tsFilePath] = compilerCtx.moduleFiles[tsFilePath] || {};
  moduleFile.jsFilePath = getJsFilePath(tsFilePath);
  moduleFile.externalImports = results.externalImports.slice();
  moduleFile.localImports = results.localImports.slice();
  moduleFile.cmpMeta = results.cmpMeta;

  // add to the module graph
  const moduleGraph: d.ModuleGraph = {
    filePath: tsFilePath,
    importPaths: results.externalImports.slice()
  };
  buildCtx.moduleGraphs.push(moduleGraph);

  // let's write the beast to our internal in-memory file system
  await compilerCtx.fs.writeFile(
    moduleFile.jsFilePath,
    results.outputText,
    { inMemoryOnly: true }
  );

  return results;
}


function getJsFilePath(filePath: string) {
  if (filePath.toLowerCase().endsWith('.tsx')) {
    filePath = filePath.substr(0, filePath.length - 3) + 'js';
  } else if (filePath.toLowerCase().endsWith('.ts')) {
    filePath = filePath.substr(0, filePath.length - 2) + 'js';
  }

  return normalizePath(filePath);
}
