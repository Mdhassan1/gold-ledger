module.exports = function babelConfig(api) {
  const isTest = api.env('test');
  api.cache.using(() => (isTest ? 'test' : 'app'));
  if (isTest) {
    return {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    };
  }
  return {
    presets: ['babel-preset-expo'],
  };
};
