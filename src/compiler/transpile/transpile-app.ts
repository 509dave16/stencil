import * as d from '../../declarations';
import { catchError, isTsFile } from '../util';
import { transpileFilesMain } from '../transpile/transpile-file-main';
import { transpileProgramMain } from '../transpile/transpile-program-main';


export async function transpileApp(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) {
  try {
    let tsFilePaths: string[];

    if (buildCtx.requiresFullBuild || buildCtx.dirsAdded.length > 0 || buildCtx.dirsDeleted.length > 0) {
      tsFilePaths = await scanDirForTsFiles(config, compilerCtx);

    } else {
      tsFilePaths = buildCtx.filesChanged.filter(filePath => {
        // do transpiling if one of the changed files is a ts file
        // and the changed file is not the components.d.ts file
        // when the components.d.ts file is written to disk it shouldn't cause a new build
        return isFileIncludePath(config, filePath);
      });
    }

    if (tsFilePaths.length > 0) {

      if (buildCtx.shouldAbort()) {
        return;
      }

      const timeSpan = config.logger.createTimeSpan(`compile started`);

      // kick off the full transpile program build
      // but don't have this function wait on it resolving
      buildCtx.transpileProgramBuild = transpileProgramMain(config, buildCtx, tsFilePaths);

      await transpileFilesMain(config, compilerCtx, buildCtx, tsFilePaths);

      timeSpan.finish(`compile finished`);
    }

  } catch (e) {
    // gah!!
    catchError(buildCtx.diagnostics, e);
  }
}


async function scanDirForTsFiles(config: d.Config, compilerCtx: d.CompilerCtx) {
  const scanDirTimeSpan = config.logger.createTimeSpan(`scan ${config.srcDir} for ts files started`, true);

  // loop through this directory and sub directories looking for
  // files that need to be transpiled
  const dirItems = await compilerCtx.fs.readdir(config.srcDir, { recursive: true });

  // filter down to only the ts files we should include
  const tsFileItems = dirItems.filter(item => {
    return item.isFile && isTsFile(item.relPath) && isFileIncludePath(config, item.absPath);
  });

  scanDirTimeSpan.finish(`scan for ts files finished`);

  // return just the abs path
  return tsFileItems.map(tsFileItem => tsFileItem.absPath);
}


export function isFileIncludePath(config: d.Config, readPath: string) {
  for (var i = 0; i < config.excludeSrc.length; i++) {
    if (config.sys.minimatch(readPath, config.excludeSrc[i])) {
      // this file is a file we want to exclude
      return false;
    }
  }

  for (i = 0; i < config.includeSrc.length; i++) {
    if (config.sys.minimatch(readPath, config.includeSrc[i])) {
      // this file is a file we want to include
      return true;
    }
  }

  // not a file we want to include, let's not add it
  return false;
}
