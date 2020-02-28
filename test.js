import Jasmine from 'jasmine';

let jasmineEnv = new Jasmine();
jasmineEnv.loadConfig({
  'spec_dir': 'test',
  'spec_files': ['**/*[sS]pec.js'],
  'random': false,
  'jasmineNodeOpts': {
    showColors: true,
    isVerbose: true,
    includeStackTrace: true,
  },
  'logLevel': 'DEBUG'
});
jasmineEnv.execute();
