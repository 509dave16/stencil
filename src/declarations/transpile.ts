import * as d from './index';


export interface TranspileFileResults {
  tsFilePath?: string;
  sourceText?: string;
  outputText: string;
  externalImports?: string[];
  localImports?: string[];
  collectionNames?: string[];
  diagnostics: d.Diagnostic[];
  cmpMeta?: d.ComponentMeta;
}


export interface TranspileProgramResults {
  diagnostics: d.Diagnostic[];
}


export interface TranspileResults {
  code?: string;
  diagnostics?: d.Diagnostic[];
  cmpMeta?: d.ComponentMeta;
}
