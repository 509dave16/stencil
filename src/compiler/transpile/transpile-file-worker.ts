import * as d from '../../declarations';
import addComponentMetadata from './transformers/add-component-metadata';
import { BuildConditionals } from '../../declarations';
import { buildConditionalsTransform } from './transformers/build-conditionals';
import { gatherSourceFileMetadata } from './datacollection/index';
import { getUserTsConfig } from './compiler-options';
import { loadTypeScriptDiagnostics } from '../../util/logger/logger-typescript';
import { normalizePath } from '../util';
import { normalizeAssetsDir } from '../component-plugins/assets-plugin';
import { normalizeStyles } from '../style/normalize-styles';
import { removeCollectionImports } from './transformers/remove-collection-imports';
import { removeDecorators } from './transformers/remove-decorators';
import { removeStencilImports } from './transformers/remove-stencil-imports';
import { CompilerHost, Diagnostic, createProgram, createSourceFile } from 'typescript';


export async function transpileFileWorker(config: d.Config, compilerCtx: d.CompilerCtx, tsFilePath: string, tsSourceText: string) {
  const results: d.TranspileFileResults = {
    outputText: null,
    diagnostics: [],
    externalImports: [],
    localImports: [],
    collectionNames: []
  };

  const options = Object.assign({}, await getUserTsConfig(config, compilerCtx));
  options.isolatedModules = true;

  // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
  options.suppressOutputPathCheck = true;

  // Filename can be non-ts file.
  options.allowNonTsExtensions = true;

  // We are not returning a sourceFile for lib file when asked by the program,
  // so pass --noLib to avoid reporting a file not found error.
  options.noLib = true;

  // Clear out other settings that would not be used in transpiling this module
  options.lib = undefined;
  options.types = undefined;
  options.noEmit = undefined;
  options.noEmitOnError = undefined;
  options.paths = undefined;
  options.rootDirs = undefined;
  options.declaration = undefined;
  options.declarationDir = undefined;
  options.out = undefined;
  options.outFile = undefined;

  options.sourceMap = undefined;

  // We are not doing a full typecheck, we are not resolving the whole context,
  // so pass --noResolve to avoid reporting missing file errors.
  options.noResolve = true;

  const sourceFile = createSourceFile(tsFilePath, tsSourceText, options.target);

  // create a compilerHost object to allow the compiler to read and write files
  const compilerHost: CompilerHost = {
    getSourceFile: (fileName) => {
      return normalizePath(fileName) === tsFilePath ? sourceFile : undefined;
    },
    writeFile: (filePath: string, outputText: string) => {
      if (filePath.endsWith('.js')) {
        results.outputText = outputText;
      }
    },
    getDefaultLibFileName: () => `lib.d.ts`,
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => ``,
    getNewLine: () => `\n`,
    fileExists: (fileName): boolean => normalizePath(fileName) === tsFilePath,
    readFile: () => ``,
    directoryExists: () => true,
    getDirectories: () => []
  };

  // create the typescript program for our one file to transpile
  const program = createProgram([tsFilePath], options, compilerHost);

  // create the type checker from the program
  const typeChecker = program.getTypeChecker();

  // get all the diagnostics from typescript
  const tsDiagnostics: Diagnostic[] = [];
  program.getSyntacticDiagnostics().forEach(d => tsDiagnostics.push(d));
  program.getOptionsDiagnostics().forEach(d => tsDiagnostics.push(d));

  // parse apart typescript's diagnostics and create our format
  loadTypeScriptDiagnostics(config.cwd, results.diagnostics, tsDiagnostics);
  if (results.diagnostics.length > 0) {
    // welp, already got an issue, let's not continue
    return results;
  }

  // create objects to get filled up during transpiling
  const moduleFiles: d.ModuleFiles = {};
  const localImports: string[] = [];

  // add the build conditional that users may be using
  const buildConditionals = {
    isDev: !!config.devMode
  } as BuildConditionals;

  // run typescript on this one file
  program.emit(undefined, undefined, undefined, undefined, {
    before: [
      gatherSourceFileMetadata(config, results.diagnostics, results.externalImports, localImports, results.collectionNames, typeChecker, moduleFiles),
      removeDecorators(),
      addComponentMetadata(moduleFiles),
      buildConditionalsTransform(buildConditionals)
    ],
    after: [
      removeStencilImports(),
      removeCollectionImports(results.collectionNames)
    ]
  });

  if (moduleFiles[tsFilePath]) {
    // extract the component metadata we gathered during transpile
    results.cmpMeta = moduleFiles[tsFilePath].cmpMeta;
  }

  if (results.cmpMeta) {
    // normalize component metadata
    results.cmpMeta.stylesMeta = normalizeStyles(config, tsFilePath, results.cmpMeta.stylesMeta);
    results.cmpMeta.assetsDirsMeta = normalizeAssetsDir(config, tsFilePath, results.cmpMeta.assetsDirsMeta);
  }

  // figure out absolute paths
  results.localImports = await resolveLocalPaths(config, tsFilePath, localImports);

  return results;
}


async function resolveLocalPaths(config: d.Config, tsFilePath: string, localImports: string[]) {
  const dir = config.sys.path.dirname(tsFilePath);
  const resolvedLocalPaths: string[] = [];

  await Promise.all(localImports.map(async localImport => {
    const absPath = normalizePath(config.sys.path.resolve(dir, localImport));

    const p = await resolveLocalPath(config, absPath);
    if (p != null) {
      resolvedLocalPaths.push(p);
    }
  }));

  return resolvedLocalPaths;
}

const PATH_SUFFIX = [
  '.ts',
  '.tsx',
  '/index.ts',
  '/index.tsx',
  '.js',
  '/index.js',
];

async function resolveLocalPath(config: d.Config, absPath: string) {
  const paths = PATH_SUFFIX.map(p => absPath + p);

  for (const p in paths) {
    const isValidFile = await isResolvedPath(config, p);
    if (isValidFile) {
      return p;
    }
  }

  return null;
}


async function isResolvedPath(config: d.Config, p: string) {
  let isValidFile = false;

  try {
    const stats = await config.sys.fs.stat(p);
    isValidFile = stats.isFile();
  } catch (e) { /**/ }

  return isValidFile;
}
