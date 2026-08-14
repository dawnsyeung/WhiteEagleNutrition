import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'public');

const DIRS_TO_COPY = ['assets', 'product-pages'];
const ROOT_FILE_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.webmanifest', '.js']);
const ROOT_FILES_TO_COPY = new Set(['Nelliesfrass.png']);

const shouldCopyRootFile = (fileName) => {
  if (ROOT_FILES_TO_COPY.has(fileName)) return true;
  return ROOT_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
};

const copyRootFiles = async () => {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const filesToCopy = entries.filter((entry) => entry.isFile() && shouldCopyRootFile(entry.name));

  await Promise.all(
    filesToCopy.map((entry) =>
      fs.cp(path.join(ROOT, entry.name), path.join(OUTPUT_DIR, entry.name), { force: true })
    )
  );
};

const copyDirectories = async () => {
  await Promise.all(
    DIRS_TO_COPY.map(async (dirName) => {
      const sourcePath = path.join(ROOT, dirName);
      try {
        const stat = await fs.stat(sourcePath);
        if (!stat.isDirectory()) return;
        await fs.cp(sourcePath, path.join(OUTPUT_DIR, dirName), { recursive: true, force: true });
      } catch {
        // Directory may not exist for all builds; safe to skip.
      }
    })
  );
};

const run = async () => {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await copyRootFiles();
  await copyDirectories();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
