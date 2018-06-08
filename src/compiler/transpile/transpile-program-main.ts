import * as d from '../../declarations';


export async function transpileProgramMain(config: d.Config, buildCtx: d.BuildCtx, tsFilePaths: string[]) {
  const timeSpan = config.logger.createTimeSpan('transpileProgram started', true);

  const results = await config.sys.transpileProgram(tsFilePaths);

  if (results.diagnostics.length > 0) {
    buildCtx.diagnostics.push(...results.diagnostics);
  }

  // done and done
  timeSpan.finish(`transpileProgram finished`);
}
