import { Config } from '../../../declarations';
import { mockLogger, mockStencilSystem } from '../../../testing/mocks';
import { validateConfig } from '../validate-config';
import * as path from 'path';


describe('validatePublicPath', () => {

  let config: Config;
  const logger = mockLogger();
  const sys = mockStencilSystem();

  beforeEach(() => {
    config = {
      sys: sys,
      logger: logger,
      rootDir: '/User/some/path/',
      suppressTypeScriptErrors: true
    };
  });


  it('should set publicPath from custom buildDir', () => {
    config.outputTargets = [{
      type: 'www',
      path: 'some-www',
      buildPath: 'some-build'
    }];
    validateConfig(config);
    expect(config.outputTargets[0].publicPath).toBe('/some-build/');
    expect(path.isAbsolute(config.outputTargets[0].publicPath)).toBe(true);
  });

});
