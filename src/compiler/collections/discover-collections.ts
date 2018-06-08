import * as d from '../../declarations';
import { normalizePath } from '../util';


export function isCollectionPackage(config: d.Config, resolveFromDir: string, moduleId: string) {
  let pkgJsonFilePath: string;
  try {
    // get the full package.json file path
    const resolvedPath = config.sys.resolveModule(resolveFromDir, moduleId);
    pkgJsonFilePath = normalizePath(resolvedPath);

  } catch (e) {
    // it's someone else's job to handle unresolvable paths
    return false;
  }

  if (pkgJsonFilePath === 'package.json') {
    // the resolved package is actually this very same package, so whatever
    return false;
  }

  // open up and parse the package.json
  // sync on purpose :( cuz we're doing this during transpile
  const pkgJsonStr = config.sys.fs.readFileSync(pkgJsonFilePath);
  const pkgData: d.PackageJsonData = JSON.parse(pkgJsonStr);

  if (pkgData.collection && pkgData.types) {
    return true;
  }

  // this import is not a collection
  return false;
}
