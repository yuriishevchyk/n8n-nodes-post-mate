const { src, dest } = require('gulp');

/**
 * Copy all SVG icons from nodes/** into the corresponding dist/ paths
 * so they're bundled alongside the compiled JS.
 */
function buildIcons() {
  return src('nodes/**/*.svg').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
