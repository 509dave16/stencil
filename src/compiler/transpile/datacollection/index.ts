import * as d from '../../../declarations';
import { isCollectionPackage } from '../../collections/discover-collections';
import { getComponentDecoratorMeta } from './component-decorator';
import { getElementDecoratorMeta } from './element-decorator';
import { getEventDecoratorMeta } from './event-decorator';
import { getListenDecoratorMeta } from './listen-decorator';
import { getMethodDecoratorMeta } from './method-decorator';
import { getPropDecoratorMeta } from './prop-decorator';
import { getStateDecoratorMeta } from './state-decorator';
import { getWatchDecoratorMeta } from './watch-decorator';
import { normalizePath } from '../../util';
import { validateComponentClass } from './validate-component';
import * as ts from 'typescript';


export function gatherProgramMetadata(config: d.Config, diagnostics: d.Diagnostic[], externalImports: string[], localImports: string[], collectionNames: string[], typechecker: ts.TypeChecker, sourceFileList: ReadonlyArray<ts.SourceFile>) {
  const moduleFiles: d.ModuleFiles = {};

  const visitFile = visitFactory(config, diagnostics, externalImports, localImports, collectionNames, typechecker, moduleFiles);

  // Visit every sourceFile in the program
  for (const sourceFile of sourceFileList) {
    ts.forEachChild(sourceFile, (node) => {
      visitFile(node, node as ts.SourceFile);
    });
  }
  return moduleFiles;
}


export function gatherSourceFileMetadata(config: d.Config, diagnostics: d.Diagnostic[], externalImports: string[], localImports: string[], collectionNames: string[], typeChecker: ts.TypeChecker, moduleFiles: d.ModuleFiles): ts.TransformerFactory<ts.SourceFile> {
  const visitFile = visitFactory(config, diagnostics, externalImports, localImports, collectionNames, typeChecker, moduleFiles);

  return () => {
    return (tsSourceFile) => visitFile(tsSourceFile, tsSourceFile) as ts.SourceFile;
  };
}


export function visitFactory(config: d.Config, diagnostics: d.Diagnostic[], externalImports: string[], localImports: string[], collectionNames: string[], typeChecker: ts.TypeChecker, moduleFiles: d.ModuleFiles) {

  return function visit(node: ts.Node, sourceFile: ts.SourceFile) {
    if (node.kind === ts.SyntaxKind.ImportDeclaration) {
      getExternalImport(config, externalImports, localImports, collectionNames, node as ts.ImportDeclaration);
    }

    if (ts.isClassDeclaration(node)) {
      const cmpMeta = visitClass(diagnostics, typeChecker, node as ts.ClassDeclaration, sourceFile);
      if (cmpMeta) {
        const tsFilePath = normalizePath(sourceFile.getSourceFile().fileName);
        moduleFiles[tsFilePath] = moduleFiles[tsFilePath] || {};
        moduleFiles[tsFilePath].cmpMeta = cmpMeta;
      }
    }

    ts.forEachChild(node, (node) => {
      visit(node, sourceFile);
    });

    return node;
  };
}

export function visitClass(diagnostics: d.Diagnostic[], checker: ts.TypeChecker, classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): d.ComponentMeta | undefined {
  let cmpMeta = getComponentDecoratorMeta(diagnostics, checker, classNode);

  if (!cmpMeta) {
    return undefined;
  }

  const componentClass = classNode.name.getText().trim();

  cmpMeta = {
    ...cmpMeta,
    componentClass: componentClass,
    membersMeta: {
      // membersMeta is shared with @Prop, @State, @Method, @Element
      ...getElementDecoratorMeta(classNode),
      ...getMethodDecoratorMeta(diagnostics, checker, classNode, sourceFile, componentClass),
      ...getStateDecoratorMeta(classNode),
      ...getPropDecoratorMeta(diagnostics, checker, classNode, sourceFile, componentClass)
    },
    eventsMeta: getEventDecoratorMeta(diagnostics, checker, classNode, sourceFile),
    listenersMeta: getListenDecoratorMeta(checker, classNode)
  };

  // watch meta collection MUST happen after prop/state decorator meta collection
  getWatchDecoratorMeta(diagnostics, classNode, cmpMeta);

  // validate the user's component class for any common errors
  validateComponentClass(diagnostics, cmpMeta, classNode);

  // Return Class Declaration with Decorator removed and as default export
  return cmpMeta;
}


function getExternalImport(config: d.Config, externalImports: string[], localImports: string[], collectionNames: string[], importNode: ts.ImportDeclaration) {
  if (!importNode.moduleSpecifier) {
    return;
  }

  const moduleId = (importNode.moduleSpecifier as ts.StringLiteral).text;

  if (moduleId.startsWith('.') || moduleId.startsWith('/')) {
    localImports.push(moduleId);
    return;
  }

  externalImports.push(moduleId);

  const isCollection = isCollectionPackage(config, config.rootDir, moduleId);
  if (isCollection) {
    collectionNames.push(moduleId);
  }
}
