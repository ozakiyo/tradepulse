import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT_ENV = join(ROOT, '.env');
const ROOT_ENV_SERVER = join(ROOT, '.env.server');

/** 5分ごとの実行ごとに .env を再読込（24h トークン差し替え後、再起動不要） */
export function reloadRootEnv_() {
  loadDotenv({ path: ROOT_ENV, override: true });
  // サーバー専用（Mac から scp されない）。本番口座・発注設定を .env より優先
  loadDotenv({ path: ROOT_ENV_SERVER, override: true });
}
