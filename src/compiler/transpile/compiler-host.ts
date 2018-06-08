import * as d from '../../declarations';
import { buildError, isDtsFile, normalizePath,  } from '../util';
import * as ts from 'typescript';


export async function getTsHost(config: d.Config, diagnostics: d.Diagnostic[], tsFilePaths: string[], writeQueue: Promise<any>[], tsCompilerOptions: ts.CompilerOptions) {
  const tsHost = ts.createCompilerHost(tsCompilerOptions);

  const moduleFiles: { [filePath: string]: string } = {};

  await Promise.all(tsFilePaths.map(async tsFilePath => {
    moduleFiles[tsFilePath] = await config.sys.fs.readFile(tsFilePath);
  }));

  tsHost.directoryExists = (dirPath) => {
    dirPath = normalizePath(dirPath);
    try {
      const stat = config.sys.fs.statSync(dirPath);
      return stat.isDirectory();
    } catch (e) {
      return false;
    }
  };

  tsHost.getSourceFile = (filePath) => {
    filePath = normalizePath(filePath);
    let tsSourceFile: ts.SourceFile = null;

    try {
      let content = moduleFiles[filePath];
      if (content == null) {
        content = config.sys.fs.readFileSync(filePath, 'utf-8');
      }

      if (isDtsFile(filePath)) {
        if (content.includes('namespace JSX {') && !content.includes('StencilJSX')) {
          // we currently have what seems to be an unsolvable problem where any third-party
          // package can provide their own global JSX types, while stencil also
          // provides them as a global in order for typescript to understand and use JSX
          // types. So we're renaming any "other" imported global JSX namespaces so there
          // are no collisions with the same global JSX interfaces stencil already has
          // we're totally up for better ideas  ¯\_(ツ)_/¯
          content = content.replace('namespace JSX {', `namespace JSX_NO_COLLISION_${Math.round(Math.random() * 99999999)} {`);
        }
      }

      tsSourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2017);

    } catch (e) {
      const err = buildError(diagnostics);
      err.messageText = `tsHost.getSourceFile unable to find: ${filePath}`;
    }

    return tsSourceFile;
  };

  tsHost.fileExists = (filePath) => {
    if (typeof moduleFiles[filePath] === 'string') {
      return true;
    }
    try {
      const stat = config.sys.fs.statSync(filePath);
      return stat.isFile();
    } catch (e) {}
    return false;
  },

  tsHost.readFile = (filePath) => {
    let content = moduleFiles[filePath];
    if (content == null) {
      content = config.sys.fs.readFileSync(filePath, 'utf-8');
    }
    return content;
  },

  tsHost.writeFile = (outputFilePath: string, outputText: string, _writeByteOrderMark: boolean, _onError: any, sourceFiles: ts.SourceFile[]): void => {
    if (tsCompilerOptions.outDir) {
      sourceFiles.forEach(sourceFile => {
        writeQueue.push(writeFileInMemory(config, sourceFile, outputFilePath, outputText));
      });
    }
  };

  return tsHost;
}


async function writeFileInMemory(config: d.Config, sourceFile: ts.SourceFile, distFilePath: string, outputText: string) {
  let tsFilePath = normalizePath(sourceFile.fileName);

  if (!config.sys.path.isAbsolute(tsFilePath)) {
    tsFilePath = normalizePath(config.sys.path.join(config.rootDir, tsFilePath));
  }

  distFilePath = normalizePath(distFilePath);

  // let's write the beast to our internal in-memory file system
  await config.sys.fs.writeFile(distFilePath, outputText, { inMemoryOnly: true });
}
