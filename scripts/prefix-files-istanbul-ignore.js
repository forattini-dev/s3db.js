import fs from 'fs'
import path from 'path'

(function(){
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist')

  const files = fs.readdirSync(dir);
  const jsFiles = files.filter(file => file.endsWith('.js'));
  console.info('dist files: ', jsFiles);

  jsFiles.forEach(file => {
    const filePath = path.resolve(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const ignoreFile = '/* istanbul ignore file */';
    content = ignoreFile + '\n' + content;
    fs.writeFileSync(filePath, content, 'utf8');
  });
})()
