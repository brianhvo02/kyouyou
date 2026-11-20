// Writes project.json from CHANGELOG.md, ROADMAP.md, README.md and package.json (run after `npm run build`).
import {writeProjectJson} from '../dist/project/project.js';

writeProjectJson(
  {
    id: 'kyouyou',
    name: 'kyouyou (共有)',
    summary: 'Code shared by the Kuukou flight-simulation apps',
    url: 'https://github.com/brianhvo02/kyouyou',
  },
  process.cwd(),
  'project.json',
);
