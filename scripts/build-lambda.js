#!/usr/bin/env node
/**
 * Pre-bundles Lambda functions with esbuild. Run before cdk synth so the pipeline
 * produces valid Lambda zips (avoids empty zip from NodejsFunction in CodeBuild).
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const lambdaDir = path.join(__dirname, '..', 'lambda');
const outDir = path.join(__dirname, '..', 'dist', 'lambda');

const lambdas = [
  { name: 'presign-uploader', entry: 'presign-uploader/index.ts' },
];

async function build() {
  for (const { name, entry } of lambdas) {
    const entryPath = path.join(lambdaDir, entry);
    const outPath = path.join(outDir, name, 'index.js');
    const outDirPath = path.dirname(outPath);

    if (!fs.existsSync(entryPath)) {
      console.error(`Entry not found: ${entryPath}`);
      process.exit(1);
    }

    fs.mkdirSync(outDirPath, { recursive: true });

    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: outPath,
    });
    console.log(`Built ${name} -> ${outPath}`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
