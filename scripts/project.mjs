// Writes project.json from CHANGELOG.md, ROADMAP.md, README.md and package.json (run after `npm run build`).
import {writeProjectJson} from '../dist/project/project.js';

writeProjectJson(
  {
    id: 'kyouyuu',
    name: 'Kyōyū (共有)',
    summary: 'Code shared by the Kyoten Kūkō flight-simulation apps',
    url: 'https://github.com/brianhvo02/kyouyuu',
  },
  process.cwd(),
  'project.json',
);
