const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const basicAuth = require('express-basic-auth');
const {
  registerTradePulseRoutes,
  startContentPulseScheduler,
} = require('./tradePulse');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3052;
const publicPath = path.join(__dirname, 'public');
const viewsPath = path.join(__dirname, 'views');

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', viewsPath);

const basicAuthUser = String(process.env.BASIC_AUTH_USER || 'admin').trim();
const basicAuthPass = String(process.env.BASIC_AUTH_PASSWORD || '').trim();
if (basicAuthPass) {
  const basicAuthMiddleware = basicAuth({
    users: { [basicAuthUser]: basicAuthPass },
    challenge: true,
    realm: 'TradePulse',
    unauthorizedResponse: () => ({ error: '認証が必要です。' }),
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return basicAuthMiddleware(req, res, next);
  });
  console.log('🔐 Basic auth enabled (HTML only):', basicAuthUser);
}

app.use(express.static(publicPath));

app.get('/', (_req, res) => {
  res.render('index');
});

registerTradePulseRoutes(app);
startContentPulseScheduler();

const server = app.listen(PORT, () => {
  console.log(`✅ TradePulse ready on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} in use. Set PORT=3053 in .env`);
    process.exit(1);
  }
  throw err;
});
