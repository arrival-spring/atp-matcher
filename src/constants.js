import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SAFE_EDITS_DIR = path.join(__dirname, '..', 'safe-edits');
export const HOST_URL = 'https://atp-matcher.example.com/';
export const GITHUB_URL = 'https://github.com/arrival-spring/atp-matcher';
