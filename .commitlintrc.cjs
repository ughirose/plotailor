module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'editor',
        'parser',
        'opfs',
        'drawer',
        'lint',
        'a11y',
        'ci'
      ]
    ]
  }
};