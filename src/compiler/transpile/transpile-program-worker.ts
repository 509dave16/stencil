import * as d from '../../declarations';
import addComponentMetadata from './transformers/add-component-metadata';
import { buildConditionalsTransform } from './transformers/build-conditionals';
import { BuildConditionals } from '../../declarations';
import { componentDependencies } from './transformers/component-dependencies';
import { generateComponentTypes } from './create-component-types';
import { getComponentsDtsSrcFilePath } from '../distribution/distribution';
import { getTsHost } from './compiler-host';
import { getUserTsConfig } from './compiler-options';
import { loadTypeScriptDiagnostics } from '../../util/logger/logger-typescript';
import { removeCollectionImports } from './transformers/remove-collection-imports';
import { removeDecorators } from './transformers/remove-decorators';
import { removeStencilImports } from './transformers/remove-stencil-imports';
import * as ts from 'typescript';


export async function transpileProgramWorker(config: d.Config, compilerCtx: d.CompilerCtx, tsFilePaths: string[]) {
  const results: d.TranspileProgramResults = {
    diagnostics: []
  };

  // get the tsconfig compiler options we'll use
  const tsOptions = await getUserTsConfig(config, compilerCtx);

  if (config.suppressTypeScriptErrors) {
    // suppressTypeScriptErrors mainly for unit testing
    tsOptions.lib = [];
  }

  const writeQueue: Promise<void>[] = [];

  // get the ts compiler host we'll use, which patches file operations
  // with our in-memory file system
  const tsHost = await getTsHost(config, results.diagnostics, tsFilePaths, writeQueue, tsOptions);

  // fire up the typescript program
  const componentsDtsSrcFilePath = getComponentsDtsSrcFilePath(config);

  // create the components.d.ts file from the component metadata
  const { checkProgram, collectionNames } = await generateComponentTypes(
    config,
    compilerCtx,
    results.diagnostics,
    tsOptions,
    tsHost,
    tsFilePaths,
    componentsDtsSrcFilePath
  );

  // get all of the ts files paths to transpile
  // ensure the components.d.ts file is always included to this transpile program
  const programTsFiles = tsFilePaths.slice();
  if (programTsFiles.indexOf(componentsDtsSrcFilePath) === -1) {
    // we must always include the components.d.ts file in this tranpsile program
    programTsFiles.push(componentsDtsSrcFilePath);
  }

  // create another program, but use the previous checkProgram to speed it up
  const program = ts.createProgram(programTsFiles, tsOptions, tsHost, checkProgram);

  // run the second program again with our new typed info
  // this is the big one, let's go ahead and kick off the transpiling
  const buildConditionals = {
    isDev: !!config.devMode
  } as BuildConditionals;

  const moduleFiles: d.ModuleFiles = {};

  program.emit(undefined, undefined, undefined, false, {
    before: [
      removeDecorators(),
      addComponentMetadata(moduleFiles),
      buildConditionalsTransform(buildConditionals)
    ],
    after: [
      removeStencilImports(),
      removeCollectionImports(collectionNames),
      componentDependencies(compilerCtx, buildCtx)
    ]
  });

  if (!config.suppressTypeScriptErrors) {
    // suppressTypeScriptErrors mainly for unit testing
    const tsDiagnostics: ts.Diagnostic[] = [];
    program.getSemanticDiagnostics().forEach(d => tsDiagnostics.push(d));
    loadTypeScriptDiagnostics(config.cwd, results.diagnostics, tsDiagnostics);
  }

  await Promise.all(writeQueue);
}
