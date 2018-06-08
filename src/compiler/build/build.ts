import * as d from '../../declarations';
import { buildAuxiliaries } from './build-auxiliaries';
import { catchError } from '../util';
import { copyTasks } from '../copy/copy-tasks';
import { emptyOutputTargetDirs } from './empty-dir';
import { getBuildContext } from './build-utils';
import { generateAppFiles } from '../app/generate-app-files';
import { generateBundles } from '../bundle/generate-bundles';
import { generateEntryModules } from '../entries/entry-modules';
import { generateIndexHtmls } from '../html/generate-index-html';
import { generateModuleMap } from '../bundle/bundle';
import { generateStyles } from '../style/style';
import { getCompilerCtx } from './compiler-ctx';
import { initCollections } from '../collections/init-collections';
import { transpileApp } from '../transpile/transpile-app';
import { writeBuildFiles } from './write-build';


export async function build(config: d.Config, compilerCtx?: d.CompilerCtx, watcher?: d.WatcherResults): Promise<d.BuildResults> {
  // create the build context if it doesn't exist
  // the buid context is the same object used for all builds and rebuilds
  // ctx is where stuff is cached for fast in-memory lookups later
  compilerCtx = getCompilerCtx(config, compilerCtx);

  if (config.enableCache) {
    await compilerCtx.cache.ensureCacheDir();
  }

  // reset the build context, this is important for rebuilds
  const buildCtx = getBuildContext(config, compilerCtx, watcher);

  try {
    // empty the directories on the first build
    await emptyOutputTargetDirs(config, compilerCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // async scan the src directory for ts files
    // then transpile them all in one go
    await transpileApp(config, compilerCtx, buildCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // initialize all the collections we found when transpiling
    // async copy collection files and upgrade collections as needed
    await initCollections(config, compilerCtx, buildCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // we've got the compiler context filled with app modules and collection dependency modules
    // figure out how all these components should be connected
    const entryModules = generateEntryModules(config, compilerCtx, buildCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // bundle js modules and create each of the components's styles
    // these can run in parallel
    const results = await Promise.all([
      generateModuleMap(config, compilerCtx, buildCtx, entryModules),
      generateStyles(config, compilerCtx, buildCtx, entryModules)
    ]);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    const jsModules = results[0];

    // both styles and modules are done bundling
    // inject the styles into the modules and
    // generate each of the output bundles
    const cmpRegistry = await generateBundles(config, compilerCtx, buildCtx, entryModules, jsModules);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // generate the app files, such as app.js, app.core.js
    await generateAppFiles(config, compilerCtx, buildCtx, entryModules, cmpRegistry);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // copy all assets
    if (!compilerCtx.hasSuccessfulBuild) {
      // only do the initial copy on the first build
      // watcher handles any re-copies
      await copyTasks(config, compilerCtx, buildCtx.diagnostics, false);
      if (buildCtx.shouldAbort()) return buildCtx.finish();
    }

    // build index file and service worker
    await generateIndexHtmls(config, compilerCtx, buildCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    // write all the files and copy asset files
    await writeBuildFiles(config, compilerCtx, buildCtx);
    if (buildCtx.shouldAbort()) return buildCtx.finish();

    await buildAuxiliaries(config, compilerCtx, buildCtx, entryModules);

  } catch (e) {
    // ¯\_(ツ)_/¯
    catchError(buildCtx.diagnostics, e);
  }

  // return what we've learned today
  return buildCtx.finish();
}
