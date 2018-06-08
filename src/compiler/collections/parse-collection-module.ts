import * as d from '../../declarations';
import { normalizePath, pathJoin } from '../util';
import { parseCollectionData } from './collection-data';


export async function parseCollectionNames(config: d.Config, compilerCtx: d.CompilerCtx, resolveFromDir: string, collectionNames: string[]) {
  await Promise.all(collectionNames.map(collectionName => {
    return parseCollectionName(config, compilerCtx, resolveFromDir, collectionName);
  }));
}


export async function parseCollectionName(config: d.Config, compilerCtx: d.CompilerCtx, resolveFromDir: string, collectionName: string) {
  let pkgJsonFilePath: string;
  try {
    // get the full package.json file path
    const resolvedPath = config.sys.resolveModule(resolveFromDir, collectionName);
    pkgJsonFilePath = normalizePath(resolvedPath);

  } catch (e) {
    // it's someone else's job to handle unresolvable paths
    return;
  }

  if (pkgJsonFilePath === 'package.json') {
    // the resolved package is actually this very same package, so whatever
    return;
  }

  // open up and parse the package.json
  const pkgJsonStr = await compilerCtx.fs.readFile(pkgJsonFilePath);
  const pkgData: d.PackageJsonData = JSON.parse(pkgJsonStr);

  if (!pkgData.collection || !pkgData.types) {
    // this import is not a stencil collection
    return;
  }

  // let's parse it and gather all the module data about it
  // internally it'll cached collection data if we've already done this
  const collection = await parseCollectionModule(config, compilerCtx, pkgJsonFilePath, pkgData);

  // check if we already added this collection to the build context
  const alreadyHasCollection = compilerCtx.collections.some(c => {
    return c.collectionName === collection.collectionName;
  });

  if (alreadyHasCollection) {
    // we already have this collection in our build context
    return;
  }

  // let's add the collection to the build context
  compilerCtx.collections.push(collection);

  if (Array.isArray(collection.dependencies)) {
    // this collection has more collections
    // let's keep digging down and discover all of them
    collection.dependencies.map(dependencyModuleId => {
      const resolveFromDir = config.sys.path.dirname(pkgJsonFilePath);
      return parseCollectionName(config, compilerCtx, resolveFromDir, dependencyModuleId);
    });
  }
}


export async function parseCollectionModule(config: d.Config, compilerCtx: d.CompilerCtx, pkgJsonFilePath: string, pkgData: d.PackageJsonData) {
  const collectionName = pkgData.name;

  let collection: d.Collection = compilerCtx.collections.find(c => c.collectionName === collectionName);
  if (collection) {
    // we've already cached the collection, no need for another resolve/readFile/parse
    // thought being that /node_modules/ isn't changing between watch builds
    return collection;
  }

  // get the root directory of the dependency
  const collectionPackageRootDir = config.sys.path.dirname(pkgJsonFilePath);

  // figure out the full path to the collection collection file
  const collectionFilePath = pathJoin(config, collectionPackageRootDir, pkgData.collection);

  // we haven't cached the collection yet, let's read this file
  const collectionJsonStr = await compilerCtx.fs.readFile(collectionFilePath);

  // get the directory where the collection collection file is sitting
  const collectionDir = normalizePath(config.sys.path.dirname(collectionFilePath));

  // parse the json string into our collection data
  collection = parseCollectionData(
    config,
    collectionName,
    collectionDir,
    collectionJsonStr
  );

  if (pkgData.module && pkgData.module !== pkgData.main) {
    collection.hasExports = true;
  }

  // remember the source of this collection node_module
  collection.moduleDir = collectionPackageRootDir;

  // append any collection data
  collection.moduleFiles.forEach(collectionModuleFile => {
    if (!compilerCtx.moduleFiles[collectionModuleFile.jsFilePath]) {
      compilerCtx.moduleFiles[collectionModuleFile.jsFilePath] = collectionModuleFile;
    }
  });

  // cache it for later yo
  compilerCtx.collections.push(collection);

  return collection;
}
