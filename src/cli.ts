import convert from './index';
import fs from 'fs';

function main() {
  // read from file
  const yaml = fs.readFileSync("/tmp/compose.yaml").toString();
  const ret = convert(yaml);
  console.log(ret);
}

main();
