import "dotenv/config";
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sendTelegramMessage } from './telegram.js';
import nodemailer from "nodemailer";
import pg from 'pg';
const { Pool } = pg;

const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// =====================================================
// PATHS
// =====================================================

const __dirname =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const PORT =
  process.env.PORT || 3000;

const DATA =
  path.join(
    __dirname,
    'data'
  );

const UPLOADS =
  path.join(
    __dirname,
    'uploads'
  );

// =====================================================
// PERSISTENT DATABASE STORE
// =====================================================
// Render's local filesystem is ephemeral. When DATABASE_URL is
// configured, keep the existing JSON-shaped application data in
// PostgreSQL so the rest of the app can continue using readJson/writeJson.
const dbPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

const dbWriteQueues = new Map();

async function initPersistentStore() {
  if (!dbPool) {
    console.log('Persistent store: JSON filesystem (DATABASE_URL not set)');
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS json_store (
      name TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await dbPool.query('SELECT name, data FROM json_store');
  const stored = new Map(result.rows.map(row => [row.name, row.data]));

  for (const file of requiredFiles) {
    const name = file;
    if (stored.has(name)) {
      fs.writeFileSync(
        path.join(DATA, name),
        JSON.stringify(stored.get(name), null, 2),
        'utf8'
      );
      continue;
    }

    const local = readJsonFileOnly(name);
    await dbPool.query(
      `INSERT INTO json_store (name, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (name) DO NOTHING`,
      [name, JSON.stringify(local)]
    );
  }

  console.log('Persistent store: PostgreSQL ENABLED');
}

function readJsonFileOnly(name) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return [];
  try {
    const data = fs.readFileSync(file, 'utf8');
    return data.trim() ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`JSON READ ERROR: ${name}`, error);
    return [];
  }
}

function queueDatabaseWrite(name, value) {
  if (!dbPool) return;
  const previous = dbWriteQueues.get(name) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => dbPool.query(
      `INSERT INTO json_store (name, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (name) DO UPDATE
       SET data = EXCLUDED.data, updated_at = NOW()`,
      [name, JSON.stringify(value)]
    ))
    .catch(error => console.error(`DATABASE WRITE ERROR: ${name}`, error));
  dbWriteQueues.set(name, next);
}

// =====================================================
// CREATE REQUIRED FOLDERS
// =====================================================

if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, {
    recursive: true
  });
}

if (!fs.existsSync(UPLOADS)) {
  fs.mkdirSync(UPLOADS, {
    recursive: true
  });
}

// =====================================================
// CREATE REQUIRED JSON FILES
// =====================================================

const requiredFiles = [
  'users.json',
  'transactions.json',
  'bank_accounts.json',
  'company_performance.json',
  'company_profit_loss_images.json',
  'profile_change_requests.json'
];

for (const file of requiredFiles) {

  const filePath =
    path.join(
      DATA,
      file
    );

  if (!fs.existsSync(filePath)) {

    fs.writeFileSync(
      filePath,
      '[]',
      'utf8'
    );
  }
}

// =====================================================
// SESSIONS
// =====================================================

const sessions =
  new Map();

// Admin -> Investor impersonation sessions. The investor password is never exposed.
const impersonationSessions = new Map();

// =====================================================
// JSON HELPERS
// =====================================================

function readJson(name) {
  return readJsonFileOnly(name);
}

function writeJson(
  name,
  value
) {

  fs.writeFileSync(
    path.join(
      DATA,
      name
    ),
    JSON.stringify(
      value,
      null,
      2
    ),
    'utf8'
  );

  queueDatabaseWrite(name, value);
}

// =====================================================
// PASSWORD
// =====================================================

function hashPassword(
  password
) {

  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

// =====================================================
// COOKIES
// =====================================================

function parseCookies(req) {

  const out = {};

  for (
    const part of (
      req.headers.cookie || ''
    ).split(';')
  ) {

    const i =
      part.indexOf('=');

    if (i > -1) {

      out[
        part
          .slice(0, i)
          .trim()
      ] =
        decodeURIComponent(
          part
            .slice(i + 1)
        );
    }
  }

  return out;
}

// =====================================================
// JSON RESPONSE
// =====================================================

function json(
  res,
  status,
  data
) {

  if (res.headersSent) {
    return;
  }

  res.writeHead(
    status,
    {
      'Content-Type':
        'application/json; charset=utf-8',

      'Cache-Control':
        'no-store'
    }
  );

  res.end(
    JSON.stringify(data)
  );
}

// =====================================================
// =====================================================
// PASSWORD RECOVERY / CHANGE HELPERS
// =====================================================

function smtpConfigured() {
  return Boolean(String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_USER || '').trim() && String(process.env.SMTP_PASS || '').trim());
}

// CURRENT USER
// =====================================================

function userFrom(req) {

  const sid =
    parseCookies(req).sid;

  if (!sid) {
    return null;
  }

  return (
    sessions.get(sid) ||
    null
  );
}

// =====================================================
// SAFE USER OBJECT
// =====================================================

function publicUser(user) {

  if (!user) {
    return null;
  }

  const {
    passwordHash,
    ...safe
  } = user;

  return safe;
}

function getLevelIncomeTotal(investor) {
  return Math.max(0, Number((Array.isArray(investor?.levelIncomeLedger) ? investor.levelIncomeLedger : [])
    .reduce((sum, entry) => sum + Number(entry?.amount || 0), 0).toFixed(2)));
}

function getLevelIncomeBalance(investor, transactions = readJson('transactions.json')) {
  const earned = getLevelIncomeTotal(investor);
  const used = transactions
    .filter(t => String(t.userId || '') === String(investor?.id || '') &&
      String(t.type || '').toUpperCase() === 'LEVEL_INCOME_WITHDRAWAL' &&
      ['VERIFIED', 'PENDING'].includes(String(t.status || '').toUpperCase()))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return Math.max(0, Number((earned - used).toFixed(2)));
}

function getLevelIncomeRequestAvailable(investor, transactions = readJson('transactions.json')) {
  const earned = getLevelIncomeTotal(investor);
  const used = transactions
    .filter(t => String(t.userId || '') === String(investor?.id || '') &&
      String(t.type || '').toUpperCase() === 'LEVEL_INCOME_WITHDRAWAL' &&
      ['VERIFIED', 'PENDING'].includes(String(t.status || '').toUpperCase()))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return Math.max(0, Number((earned - used).toFixed(2)));
}


// =====================================================
// SPARTNER PHASE 3 BUSINESS RULES
// =====================================================

function indiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function indiaMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function indiaDayNumber(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short'
  }).format(date);
  return weekday;
}

function isIndiaWeekend(date = new Date()) {
  const day = indiaDayNumber(date);
  return day === 'Sat' || day === 'Sun';
}

function daysBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

function directDownline(users, sponsorId) {
  return users.filter(u =>
    u.role === 'investor' &&
    String(u.sponsorId || '') === String(sponsorId || '')
  ).sort((a, b) => String(a.createdAt || a.joinedAt || a.id).localeCompare(String(b.createdAt || b.joinedAt || b.id))).slice(0, 5);
}

function buildDownlineLevels(userId, users, maxLevel = 5) {
  const byId = new Map(users.map(u => [u.id, u]));
  const result = [];
  let frontier = [byId.get(userId)].filter(Boolean);
  for (let level = 1; level <= maxLevel; level++) {
    const next = [];
    for (const parent of frontier) {
      for (const child of directDownline(users, parent.id)) {
        result.push({ user: child, level });
        next.push(child);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return result;
}

function getInvestorTierData(userId, users) {
  const levels = buildDownlineLevels(userId, users, 5);
  const totals = [0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0];
  for (const item of levels) {
    const level = Number(item.level);
    counts[level] += 1;
    totals[level] += Number(item.user.totalInvestment || 0);
  }
  const l1 = totals[1], l12 = l1 + totals[2], l123 = l12 + totals[3];
  let tier = 'Normal';
  if (l1 >= 500000 || l12 >= 700000 || l123 >= 1000000) tier = 'Gold';
  else if (l1 >= 200000 || l12 >= 400000 || l123 >= 500000) tier = 'Silver';
  const roiRate = tier === 'Gold' ? 0.02 : 0.01;
  const levelRate = tier === 'Gold' ? 0.12 : tier === 'Silver' ? 0.10 : null;
  return {
    tier, roiRate, levelRate, withdrawalCommission: tier === 'Gold' ? 0 : tier === 'Silver' ? 0.05 : 0.10,
    counts: counts.slice(1), totals: totals.slice(1),
    silver: { l1, l2: totals[2], l3: totals[3], l12, l123, l1Target: 200000, l12Target: 400000, l123Target: 500000 },
    gold: { l1, l2: totals[2], l3: totals[3], l12, l123, l1Target: 500000, l12Target: 700000, l123Target: 1000000 }
  };
}

function getLevelIncomeRate(parent, users, level) {
  const tier = getInvestorTierData(parent.id, users).tier;
  // Silver changes the withdrawal commission only. Its Level Income follows
  // the normal five-level ROI-based rates.
  if (tier === 'Gold') return 0.12;
  return level === 1 ? 0.10 : level === 2 ? 0.10 : level === 3 ? 0.07 : level === 4 ? 0.05 : level === 5 ? 0.03 : 0;
}

function buildLevelIncomeSummary(userId, users) {
  const byId = new Map(users.map(u => [u.id, u]));
  const result = [];
  let parentId = byId.get(userId)?.sponsorId || null;
  let level = 1;

  while (parentId && level <= 5) {
    const parent = byId.get(parentId);
    if (!parent) break;
    result.push({
      level,
      userId: parent.id,
      name: parent.name || '',
      rate: getLevelIncomeRate(parent, users, level)
    });
    parentId = parent.sponsorId || null;
    level += 1;
  }
  return result;
}

function buildDownlineIncomeDetails(userId, users, ledger) {
  const children = new Map();
  for (const u of users) {
    if (u.role !== 'investor') continue;
    const sponsor = String(u.sponsorId || '');
    if (!children.has(sponsor)) children.set(sponsor, []);
    children.get(sponsor).push(u);
  }
  for (const [sponsor, list] of children) {
    list.sort((a, b) => String(a.createdAt || a.joinedAt || a.id).localeCompare(String(b.createdAt || b.joinedAt || b.id)));
    children.set(sponsor, list.slice(0, 5));
  }

  const entries = Array.isArray(ledger) ? ledger : [];
  const details = [];
  const queue = (children.get(String(userId)) || []).map(u => ({ user: u, level: 1 }));

  while (queue.length) {
    const { user, level } = queue.shift();
    const incomeHistory = entries
      .filter(e => String(e.sourceUserId || '') === String(user.id))
      .map(e => ({
        date: e.date || '',
        sourceROI: Number(e.sourceROI || 0),
        rate: Number(e.rate || 0),
        amount: Number(e.amount || 0),
        level: Number(e.level || level)
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const incomeGenerated = Number(incomeHistory.reduce((sum, x) => sum + x.amount, 0).toFixed(2));
    details.push({
      id: user.id,
      name: user.name || '',
      level,
      sponsorId: user.sponsorId || null,
      joinedAt: user.createdAt || user.joinedAt || null,
      totalInvestment: Number(user.totalInvestment || 0),
      levelIncomeGenerated: incomeGenerated,
      incomeHistory
    });

    for (const child of children.get(String(user.id)) || []) {
      if (level < 5 && (children.get(String(user.id)) || []).indexOf(child) < 5) queue.push({ user: child, level: level + 1 });
    }
  }

  return details;
}

function calculateCashback(investorId, transactions) {
  return transactions
    .filter(t => t.userId === investorId &&
      String(t.type || '').toUpperCase() === 'DEPOSIT' &&
      String(t.status || '').toUpperCase() === 'VERIFIED')
    .map(t => ({
      depositId: t.id,
      amount: Number(t.amount || 0),
      cashback: Number(t.amount || 0) * 0.05,
      date: t.verifiedAt || t.createdAt || t.date || ''
    }));
}

function addIndiaDays(dateKey, days = 1) {
  const date = new Date(`${dateKey}T12:00:00+05:30`);
  date.setUTCDate(date.getUTCDate() + days);
  return indiaDateKey(date);
}

function applyDailyRoiAndLevels(users, transactions) {
  const today = indiaDateKey();
  let changed = false;
  const investors = users.filter(u => u.role === 'investor');
  const byId = new Map(users.map(u => [u.id, u]));

  // Saturday/Sunday: do not credit ROI/Level Income for the weekend itself.
  // However, if the server was not run on earlier weekdays, backfill those
  // missed weekday dates now. This keeps weekend logins read-only for the
  // weekend while preserving all weekday Level Income history.
  const weekend = isIndiaWeekend();

  for (const investor of investors) {
    if (syncTargetStatus(investor, transactions)) changed = true;
    if (investor.targetAchieved || String(investor.status || '').toUpperCase() === 'CLOSED') {
      investor.todayROI = 0;
      investor.lastROIAmount = 0;
      continue;
    }
    // A missing lastROIDate means ROI starts from the next calendar day.
    if (!investor.lastROIDate) {
      investor.lastROIDate = today;
      investor.todayROI = 0;
      changed = true;
      continue;
    }

    // Catch up any missed weekdays since the last credited ROI.
    // Saturday and Sunday are always skipped.
    let roiDate = addIndiaDays(investor.lastROIDate, 1);

    while (roiDate <= today) {
      const dateForWeekdayCheck = new Date(`${roiDate}T12:00:00+05:30`);

      if (isIndiaWeekend(dateForWeekdayCheck)) {
        roiDate = addIndiaDays(roiDate, 1);
        continue;
      }

      const balance = Number(investor.currentBalance || 0);

      if (balance <= 0) {
        investor.lastROIDate = roiDate;
        investor.todayROI = 0;
        investor.lastROIAmount = 0;
        changed = true;
        roiDate = addIndiaDays(roiDate, 1);
        continue;
      }

      const tierData = getInvestorTierData(investor.id, users);
      const roiRate = tierData.roiRate;
      const roiBase = Math.floor(balance);
      const roi = Math.floor(roiBase * roiRate);

      investor.todayROI = roi;
      investor.lastROIAmount = roi;
      investor.lastROIDate = roiDate;
      investor.currentBalance = Number((balance + roi).toFixed(2));
      if (!Array.isArray(investor.roiHistory)) investor.roiHistory = [];
      investor.roiHistory.push({ date: roiDate, openingBalance: balance, roiRate: roiRate * 100, amount: roi, closingBalance: investor.currentBalance });
      investor.withdrawalAllowance = Number(((Number(investor.withdrawalAllowance || 0) + roi)).toFixed(2));
      changed = true;

      // Level income is generated only when a weekday ROI is actually credited.
      let parentId = investor.sponsorId || null;
      let level = 1;

      while (parentId && level <= 5) {
        const parent = byId.get(parentId);
        if (!parent) break;
        if (parent.targetAchieved || String(parent.status || '').toUpperCase() === 'CLOSED') {
          parentId = parent.sponsorId || null;
          level += 1;
          continue;
        }

        const rate = getLevelIncomeRate(parent, users, level);
        const income = Number((roi * rate).toFixed(2));

        if (income > 0) {
          if (!Array.isArray(parent.levelIncomeLedger)) parent.levelIncomeLedger = [];

          // Idempotency key: one Level Income entry per source ROI date and level.
          const duplicate = parent.levelIncomeLedger.some(entry =>
            String(entry.sourceUserId) === String(investor.id) &&
            String(entry.date) === String(roiDate) &&
            Number(entry.level) === level
          );

          if (!duplicate) {
            parent.levelIncomeBalance = Number(((parent.levelIncomeBalance || 0) + income).toFixed(2));
            parent.levelIncomeLedger.push({
              id: `LI_${roiDate}_${investor.id}_L${level}_${crypto.randomBytes(3).toString('hex')}`,
              sourceUserId: investor.id,
              sourceName: investor.name || '',
              level,
              rate: rate * 100,
              sourceDeposit: Number(investor.totalInvestment || 0),
              sourceROI: roi,
              amount: income,
              date: roiDate,
              time: new Date().toISOString()
            });
          }
        }

        parentId = parent.sponsorId || null;
        level += 1;
      }

      roiDate = addIndiaDays(roiDate, 1);
    }

    if (weekend && Number(investor.todayROI || 0) !== 0) {
      investor.todayROI = 0;
      changed = true;
    }
  }

  return changed;
}

function getVerifiedDepositTotal(investorId, transactions = readJson('transactions.json')) {
  return Number(transactions.filter(t => String(t.userId || '') === String(investorId || '') && String(t.type || '').toUpperCase() === 'DEPOSIT' && String(t.status || '').toUpperCase() === 'VERIFIED').reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
}

function getTargetProgress(investorId, transactions = readJson('transactions.json')) {
  const depositTotal = getVerifiedDepositTotal(investorId, transactions);
  const targetAmount = Number((depositTotal * 2).toFixed(2));
  const withdrawals = transactions.filter(t => String(t.userId || '') === String(investorId || '') && ['WITHDRAWAL', 'LEVEL_INCOME_WITHDRAWAL'].includes(String(t.type || '').toUpperCase()) && String(t.status || '').toUpperCase() === 'VERIFIED').map(t => ({ id: t.id, type: String(t.type || '').toUpperCase(), amount: Number(t.amount || 0), date: t.verifiedAt || t.createdAt || t.date || '', status: t.status || '' }));
  const withdrawn = Number(withdrawals.reduce((sum, t) => sum + t.amount, 0).toFixed(2));
  const remaining = Math.max(0, Number((targetAmount - withdrawn).toFixed(2)));
  return { depositTotal, targetAmount, withdrawn, remaining, achieved: targetAmount > 0 && withdrawn >= targetAmount, withdrawals };
}

function syncTargetStatus(investor, transactions = readJson('transactions.json')) {
  if (!investor || investor.role !== 'investor') return false;
  const progress = getTargetProgress(investor.id, transactions);
  const wasAchieved = Boolean(investor.targetAchieved);
  if (progress.achieved) {
    investor.targetAchieved = true;
    if (!investor.targetAchievedAt) investor.targetAchievedAt = new Date().toISOString();
    investor.status = 'CLOSED';
  } else if (!wasAchieved) {
    investor.targetAchieved = false;
    if (investor.status === 'CLOSED') investor.status = 'ACTIVE';
  }
  return Boolean(progress.achieved) !== wasAchieved;
}

function getAvailableCashback(investorId, transactions) {
  const earned = calculateCashback(investorId, transactions)
    .reduce((s, x) => s + x.cashback, 0);
  const used = transactions
    .filter(t => t.userId === investorId &&
      String(t.type || '').toUpperCase() === 'CASHBACK_WITHDRAWAL' &&
      ['VERIFIED','PENDING'].includes(String(t.status || '').toUpperCase()))
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  return Math.max(0, Number((earned - used).toFixed(2)));
}


// =====================================================
// REQUEST BODY
// =====================================================

function body(req) {

  return new Promise(
    (resolve, reject) => {

      let s = '';

      req.on(
        'data',
        chunk => {

          s += chunk.toString();

          if (
            s.length >
            1e6
          ) {

            reject(
              new Error(
                'Request body too large'
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        'end',
        () => {

          try {

            resolve(
              s
                ? JSON.parse(s)
                : {}
            );

          } catch (error) {

            reject(
              new Error(
                'Invalid JSON request'
              )
            );
          }
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}

// =====================================================
// MULTIPART BODY PARSER
// =====================================================

function multipartBody(req) {

  return new Promise(
    (resolve, reject) => {

      const contentType =
        req.headers['content-type'] || '';

      const match =
        contentType.match(
          /boundary=(?:"([^"]+)"|([^;]+))/i
        );

      if (!match) {

        reject(
          new Error(
            'Multipart boundary not found'
          )
        );

        return;
      }

      const boundary =
        match[1] ||
        match[2];

      const chunks = [];

      let totalSize = 0;

      const MAX_SIZE =
        10 * 1024 * 1024;

      req.on(
        'data',
        chunk => {

          totalSize +=
            chunk.length;

          if (
            totalSize >
            MAX_SIZE
          ) {

            reject(
              new Error(
                'Payment screenshot must be below 10 MB'
              )
            );

            req.destroy();

            return;
          }

          chunks.push(chunk);
        }
      );

      req.on(
        'error',
        reject
      );

      req.on(
        'end',
        () => {

          try {

            const buffer =
              Buffer.concat(chunks);

            const boundaryBuffer =
              Buffer.from(
                `--${boundary}`
              );

            const fields = {};
            const files = {};

            let position = 0;

            while (true) {

              const start =
                buffer.indexOf(
                  boundaryBuffer,
                  position
                );

              if (start === -1) {
                break;
              }

              let partStart =
                start +
                boundaryBuffer.length;

              if (
                buffer
                  .slice(
                    partStart,
                    partStart + 2
                  )
                  .toString() ===
                '--'
              ) {
                break;
              }

              if (
                buffer
                  .slice(
                    partStart,
                    partStart + 2
                  )
                  .toString() ===
                '\r\n'
              ) {

                partStart += 2;
              }

              const nextBoundary =
                buffer.indexOf(
                  boundaryBuffer,
                  partStart
                );

              if (
                nextBoundary === -1
              ) {
                break;
              }

              let part =
                buffer.slice(
                  partStart,
                  nextBoundary
                );

              if (
                part
                  .slice(-2)
                  .toString() ===
                '\r\n'
              ) {

                part =
                  part.slice(
                    0,
                    -2
                  );
              }

              const headerEnd =
                part.indexOf(
                  Buffer.from(
                    '\r\n\r\n'
                  )
                );

              if (
                headerEnd === -1
              ) {

                position =
                  nextBoundary;

                continue;
              }

              const headerText =
                part
                  .slice(
                    0,
                    headerEnd
                  )
                  .toString(
                    'utf8'
                  );

              const content =
                part.slice(
                  headerEnd + 4
                );

              const dispositionMatch =
                headerText.match(
                  /Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i
                );

              if (
                !dispositionMatch
              ) {

                position =
                  nextBoundary;

                continue;
              }

              const fieldName =
                dispositionMatch[1];

              const originalFilename =
                dispositionMatch[2];

              if (
                originalFilename !==
                undefined
              ) {

                const typeMatch =
                  headerText.match(
                    /Content-Type:\s*([^\r\n]+)/i
                  );

                const mimeType =
                  typeMatch
                    ? typeMatch[1].trim()
                    : 'application/octet-stream';

                files[fieldName] = {

                  originalName:
                    originalFilename,

                  mimeType,

                  buffer:
                    content
                };

              } else {

                fields[fieldName] =
                  content.toString(
                    'utf8'
                  );
              }

              position =
                nextBoundary;
            }

            resolve({
              fields,
              files
            });

          } catch (error) {

            reject(error);
          }
        }
      );
    }
  );
}

// =====================================================
// SAVE PAYMENT SCREENSHOT
// =====================================================

function savePaymentScreenshot(
  file
) {

  if (!file) {

    throw new Error(
      'Payment screenshot is required'
    );
  }

  if (
    !file.buffer ||
    !file.buffer.length
  ) {

    throw new Error(
      'Payment screenshot is empty'
    );
  }

  const allowedTypes = {

    'image/jpeg':
      '.jpg',

    'image/png':
      '.png',

    'image/webp':
      '.webp'
  };

  const ext =
    allowedTypes[
      String(
        file.mimeType || ''
      ).toLowerCase()
    ];

  if (!ext) {

    throw new Error(
      'Only JPG, PNG or WEBP payment screenshots are allowed'
    );
  }

  const MAX_FILE_SIZE =
    8 * 1024 * 1024;

  if (
    file.buffer.length >
    MAX_FILE_SIZE
  ) {

    throw new Error(
      'Payment screenshot must be below 8 MB'
    );
  }

  const b =
    file.buffer;

  let validImage =
    false;

  // JPEG
  if (
    ext === '.jpg' &&
    b.length >= 3 &&
    b[0] === 0xff &&
    b[1] === 0xd8 &&
    b[2] === 0xff
  ) {

    validImage = true;
  }

  // PNG
  if (
    ext === '.png' &&
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {

    validImage = true;
  }

  // WEBP
  if (
    ext === '.webp' &&
    b.length >= 12 &&
    b.toString(
      'ascii',
      0,
      4
    ) === 'RIFF' &&
    b.toString(
      'ascii',
      8,
      12
    ) === 'WEBP'
  ) {

    validImage = true;
  }

  if (!validImage) {

    throw new Error(
      'Uploaded file is not a valid image'
    );
  }

  const filename =
    crypto
      .randomBytes(24)
      .toString('hex') +
    ext;

  const filePath =
    path.join(
      UPLOADS,
      filename
    );

  fs.writeFileSync(
    filePath,
    file.buffer
  );

  return filename;
}

// =====================================================
// SAVE COMPANY PROFIT/LOSS IMAGE
// =====================================================

function saveCompanyProfitLossImage(file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new Error('Company profit/loss image is required');
  }

  const allowedTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  };

  const ext = allowedTypes[String(file.mimeType || '').toLowerCase()];
  if (!ext) throw new Error('Only JPG, PNG or WEBP images are allowed');

  if (file.buffer.length > 8 * 1024 * 1024) {
    throw new Error('Company profit/loss image must be below 8 MB');
  }

  const b = file.buffer;
  let validImage = false;
  if (ext === '.jpg' && b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) validImage = true;
  if (ext === '.png' && b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) validImage = true;
  if (ext === '.webp' && b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') validImage = true;
  if (!validImage) throw new Error('Uploaded file is not a valid image');

  const filename = 'company-pl-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOADS, filename), b);
  return filename;
}

// ======================================================
// PASSWORD RESET OTP STORAGE
// ======================================================

const passwordResetCodes = new Map();

       

// =====================================================
// INITIALIZE PERSISTENT STORE BEFORE SERVING REQUESTS
// =====================================================
await initPersistentStore();

// =====================================================
// SERVER
// =====================================================

const server =
  http.createServer(
    async (
    req,
    res
    ) => {

    try {

                // ======================================================
                // ADMIN RETURN FROM INVESTOR IMPERSONATION (TOP-LEVEL)
                // ======================================================
                if (req.url === '/api/admin/return' && req.method === 'POST') {
                  const sid = parseCookies(req).sid;
                  const adminId = sid ? impersonationSessions.get(sid) : null;
                  if (!adminId) return json(res, 403, { error: 'No admin impersonation session is active' });
                  const users = readJson('users.json');
                  const admin = users.find(u => u.id === adminId && u.role === 'admin');
                  if (!admin) return json(res, 404, { error: 'Admin account not found' });
                  sessions.set(sid, admin);
                  impersonationSessions.delete(sid);
                  return json(res, 200, { message: 'Returned to Admin Portal', user: publicUser(admin) });
                }

                // ======================================================
                // CHANGE PASSWORD - LOGGED IN USER
                // ======================================================

                if (req.url === '/api/change-password' && req.method === 'POST') {
                  const sessionUser = userFrom(req);
                  if (!sessionUser) return json(res, 401, { error: 'Please login again.' });
                  if (sessionUser.impersonatingAdmin) return json(res, 403, { error: 'Password changes are disabled while viewing an investor as Admin.' });
                  const b = await body(req);
                  const currentPassword = String(b.currentPassword || '');
                  const newPassword = String(b.newPassword || '');
                  const confirmPassword = String(b.confirmPassword || '');
                  if (!currentPassword || !newPassword || !confirmPassword) return json(res, 400, { error: 'Current password, new password and confirmation are required.' });
                  if (newPassword.length < 4) return json(res, 400, { error: 'New password must be at least 4 characters.' });
                  if (newPassword !== confirmPassword) return json(res, 400, { error: 'New passwords do not match.' });
                  if (hashPassword(currentPassword) !== sessionUser.passwordHash) return json(res, 401, { error: 'Current password is incorrect.' });
                  if (currentPassword === newPassword) return json(res, 400, { error: 'New password must be different from the current password.' });
                  const users = readJson('users.json');
                  const user = users.find(u => String(u.id) === String(sessionUser.id));
                  if (!user) return json(res, 404, { error: 'User account not found.' });
                  user.passwordHash = hashPassword(newPassword);
                  delete user.password;
                  writeJson('users.json', users);
                  sessions.set(parseCookies(req).sid, user);
                  return json(res, 200, { ok: true, message: 'Password changed successfully.' });
                }

// ======================================================
                // FORGOT PASSWORD - SEND OTP
                // ======================================================

                if (
                  req.url === "/api/forgot-password" &&
                  req.method === "POST"
                ) {
                  const b = await body(req);

                  const email = String(b.email || "")
                    .trim()
                    .toLowerCase();

                  if (!email) {
                    return json(res, 400, {
                      error: "Email is required"
                    });
                  }

                  const users = readJson("users.json");

                  const user = users.find(
                    x =>
                      String(x.email || "")
                        .trim()
                        .toLowerCase() === email
                  );

                  if (!user) {
                    return json(res, 200, {
                      ok: true,
                      message: "If this email is registered, an OTP has been sent."
                    });
                  }

                  if (!smtpConfigured()) {
                    return json(res, 503, {
                      ok: false,
                      error: 'Password recovery email service is not configured. Please configure SMTP_HOST, SMTP_USER and SMTP_PASS in .env.'
                    });
                  }

                  const otp = String(
                    crypto.randomInt(100000, 1000000)
                  );

                  passwordResetCodes.set(email, {
                    otp,
                    expiresAt: Date.now() + 10 * 60 * 1000
                  });

                  await mailTransporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: email,
                    subject: "SPARTNER Password Reset OTP",
                    text:
                      `Your SPARTNER password reset OTP is: ${otp}\n\n` +
                      `This OTP is valid for 10 minutes.\n\n` +
                      `If you did not request a password reset, please ignore this email.`
                  });

                  return json(res, 200, {
                    ok: true,
                    message: "OTP sent successfully."
                  });
                }

                // ============================================================
                // RESET PASSWORD
                // ============================================================

                if (
                  req.url === "/api/reset-password" &&
                  req.method === "POST"
                ) {

                  const b = await body(req);

                  const email = String(b.email || "")
                    .trim()
                    .toLowerCase();

                  const otp = String(b.otp || "").trim();

                  const newPassword =
                    String(b.newPassword || "");

                  const resetData =
                    passwordResetCodes.get(email);

                  if (!resetData) {
                    return json(res, 400, {
                      ok: false,
                      message: "OTP not found or expired."
                    });
                  }

                  if (
                    Date.now() >
                    resetData.expiresAt
                  ) {

                    passwordResetCodes.delete(email);

                    return json(res, 400, {
                      ok: false,
                      message:
                        "OTP expired. Please request a new OTP."
                    });
                  }

                  if (
                    String(resetData.otp) !== otp
                  ) {

                    return json(res, 400, {
                      ok: false,
                      message: "Invalid OTP."
                    });
                  }

                  if (!newPassword.trim()) {
                    return json(res, 400, {
                      ok: false,
                      message:
                        "New password is required."
                    });
                  }

                  if (newPassword.length < 4) {
                    return json(res, 400, {
                      ok: false,
                      message:
                        "New password must be at least 4 characters."
                    });
                  }

                  const users =
                    readJson("users.json");

                  const user =
                    users.find(
                      x =>
                        String(x.email || "")
                          .trim()
                          .toLowerCase() === email
                    );

                  if (!user) {
                    return json(res, 404, {
                      ok: false,
                      message: "User not found."
                    });
                  }

                  // ============================================================
                  // IMPORTANT:
                  // LOGIN checks user.passwordHash,
                  // so RESET must also save passwordHash.
                  // ============================================================

                  user.passwordHash =
                    hashPassword(newPassword);

                  // Remove old plaintext password field
                  delete user.password;

                  fs.writeFileSync(
                    path.join(
                      __dirname,
                      "data",
                      "users.json"
                    ),
                    JSON.stringify(
                      users,
                      null,
                      2
                    )
                  );

                  // OTP can be used only once
                  passwordResetCodes.delete(email);

                  return json(res, 200, {
                    ok: true,
                    message:
                      "Password reset successfully."
                  });
                }

                // =================================================
                // ADMIN RETURN FROM INVESTOR IMPERSONATION
                // Keep this route before the legacy duplicated auth block.
                // =================================================

                if (req.url === '/api/admin/return' && req.method === 'POST') {
                  const sid = parseCookies(req).sid;
                  const adminId = sid ? impersonationSessions.get(sid) : null;
                  if (!adminId) return json(res, 403, { error: 'No admin impersonation session is active' });
                  const users = readJson('users.json');
                  const admin = users.find(u => u.id === adminId && u.role === 'admin');
                  if (!admin) return json(res, 404, { error: 'Admin account not found' });
                  sessions.set(sid, admin);
                  impersonationSessions.delete(sid);
                  return json(res, 200, { message: 'Returned to Admin Portal', user: publicUser(admin) });
                }

                // =================================================
                // LOGIN
                // =================================================

                if (
                  req.url === '/api/login' &&
                  req.method === 'POST'
                ) {

                  const b =
                    await body(req);

                  const users =
                    readJson(
                      'users.json'
                    );

                  const email =
                    String(
                      b.email || ''
                    )
                      .trim()
                      .toLowerCase();

                  const password =
                    String(
                      b.password || ''
                    );

                  const user =
                    users.find(
                      x =>
                        String(x.email || '')
                          .trim()
                          .toLowerCase() === email ||

                        String(x.id || '')
                          .trim()
                          .toLowerCase() === email
                    );

                  const ok =
                    user &&
                    hashPassword(password) ===
                      user.passwordHash;

                  if (!ok) {

                    return json(
                      res,
                      401,
                      {
                        error:
                          'Invalid email or password'
                      }
                    );
                  }

                  if (
                    user.role === 'investor' &&
                    String(
                      user.status || 'ACTIVE'
                    ).toUpperCase() !== 'ACTIVE'
                  ) {

                    return json(
                      res,
                      403,
                      {
                        error:
                          'Investor account is not approved/active yet.'
                      }
                    );
                  }

                  const sid =
                    crypto
                      .randomBytes(32)
                      .toString('hex');

                  sessions.set(
                    sid,
                    user
                  );

                  res.writeHead(
                    200,
                    {
                      'Content-Type':
                        'application/json; charset=utf-8',

                      'Set-Cookie':
                        `sid=${encodeURIComponent(
                          sid
                        )}; HttpOnly; SameSite=Lax; Path=/`
                    }
                  );

                  return res.end(
                    JSON.stringify({
                      user:
                        publicUser(user)
                    })
                  );
                }

                // =================================================
                // LOGOUT
                // =================================================

                if (
                  req.url === '/api/logout' &&
                  req.method === 'POST'
                ) {

                  const sid =
                    parseCookies(req).sid;

                  if (sid) {
                    sessions.delete(sid);
                    impersonationSessions.delete(sid);
                  }

                  res.writeHead(
                    200,
                    {
                      'Set-Cookie':
                        'sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',

                      'Content-Type':
                        'application/json; charset=utf-8'
                    }
                  );

                  return res.end('{}');
                }

                // =================================================
                // CURRENT USER
                // =================================================

                if (
                  req.url === '/api/me' &&
                  req.method === 'GET'
                ) {

                  const user =
                    userFrom(req);

                  if (!user) {

                    return json(
                      res,
                      401,
                      {
                        error:
                          'Not logged in'
                      }
                    );
                  }

                  const safeUser = publicUser(user);
                  const sid = parseCookies(req).sid;
                  if (sid && impersonationSessions.has(sid)) safeUser.impersonatingAdmin = true;
                  return json(
                    res,
                    200,
                    { user: safeUser }
                  );
                }
        

        // =================================================
        // LOGIN
        // =================================================

        if (
          req.url === '/api/login' &&
          req.method === 'POST'
        ) {

          const b =
            await body(req);

          const users =
            readJson(
              'users.json'
            );

          const email =
            String(
              b.email || ''
            )
              .trim()
              .toLowerCase();

          const password =
            String(
              b.password || ''
            );

          const user =
            users.find(
              x =>
                String(x.email || '').toLowerCase() === email ||
                String(x.id || '').toLowerCase() === email
            );

          const ok =
            user &&
            (
            
              hashPassword(password) ===
                user.passwordHash
            );

          if (!ok) {

            return json(
              res,
              401,
              {
                error:
                  'Invalid email or password'
              }
            );
          }

          if (
            user.role === 'investor' &&
            String(user.status || 'ACTIVE').toUpperCase() !== 'ACTIVE'
          ) {
            return json(
              res,
              403,
              {
                error:
                  'Investor account is not approved/active yet.'
              }
            );
          }

          const sid =
            crypto
              .randomBytes(32)
              .toString('hex');

          sessions.set(
            sid,
            user
          );

          res.writeHead(
            200,
            {
              'Content-Type':
                'application/json; charset=utf-8',

              'Set-Cookie':
                `sid=${encodeURIComponent(
                  sid
                )}; HttpOnly; SameSite=Lax; Path=/`
            }
          );

          return res.end(
            JSON.stringify({
              user:
                publicUser(user)
            })
          );
        }

        // =================================================
        // LOGOUT
        // =================================================

        if (
          req.url === '/api/logout' &&
          req.method === 'POST'
        ) {

          const sid =
            parseCookies(req).sid;

          if (sid) {
            sessions.delete(sid);
          }

          res.writeHead(
            200,
            {
              'Set-Cookie':
                'sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/',

              'Content-Type':
                'application/json; charset=utf-8'
            }
          );

          return res.end('{}');
        }

        // =================================================
        // CURRENT USER
        // =================================================

        if (
          req.url === '/api/me' &&
          req.method === 'GET'
        ) {

          const user =
            userFrom(req);

          if (!user) {

            return json(
              res,
              401,
              {
                error:
                  'Not logged in'
              }
            );
          }

          return json(
            res,
            200,
            {
              user:
                publicUser(user)
            }
          );
        }

        // =================================================
        // PROFILE + CHANGE REQUESTS
        // =================================================

        if (
          req.url === '/api/profile' &&
          req.method === 'POST'
        ) {

          const user = userFrom(req);

          if (!user) {
            return json(res, 401, { error: 'Please login again.' });
          }

          const b = await body(req);
          const users = readJson('users.json');
          const index = users.findIndex(x => x.id === user.id);

          if (index === -1) {
            return json(res, 404, { error: 'User account not found' });
          }

          const existing = users[index];
          const proposed = {
            phone: String(b.phone || '').trim(),
            pan: String(b.pan || '').trim().toUpperCase(),
            aadhaar: String(b.aadhaar || '').replace(/\D/g, ''),
            address: String(b.address || '').trim(),
            city: String(b.city || '').trim(),
            state: String(b.state || '').trim(),
            pincode: String(b.pincode || '').replace(/\D/g, '')
          };

          if (!proposed.phone) {
            return json(res, 400, { error: 'Phone number is required' });
          }
          if (!/^[0-9+\-\s()]{7,15}$/.test(proposed.phone)) {
            return json(res, 400, { error: 'Enter a valid phone number' });
          }
          if (proposed.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(proposed.pan)) {
            return json(res, 400, { error: 'Enter a valid PAN number' });
          }
          if (proposed.aadhaar && !/^\d{12}$/.test(proposed.aadhaar)) {
            return json(res, 400, { error: 'Aadhaar must contain 12 digits' });
          }
          if (proposed.pincode && !/^\d{6}$/.test(proposed.pincode)) {
            return json(res, 400, { error: 'Pincode must contain 6 digits' });
          }

          const changes = {};
          for (const field of Object.keys(proposed)) {
            const oldValue = String(existing[field] || '');
            if (oldValue !== proposed[field]) {
              changes[field] = {
                oldValue,
                newValue: proposed[field]
              };
            }
          }

          // Admin profile details are saved directly. Investor profile edits
          // continue to use the approval workflow after the first completion.
          if (user.role === 'admin') {
            for (const [field, value] of Object.entries(proposed)) {
              existing[field] = value;
            }
            existing.profileCompletedAt = existing.profileCompletedAt || new Date().toISOString();
            writeJson('users.json', users);
            sessions.set(parseCookies(req).sid, existing);
            return json(res, 200, {
              ok: true,
              message: 'Admin profile updated successfully.',
              user: publicUser(existing)
            });
          }

          if (user.role !== 'investor') {
            return json(res, 403, { error: 'Profile access denied' });
          }

          if (user.role !== 'investor') {
            return json(res, 403, { error: 'Profile access denied' });
          }

          const hasExistingProfile = Boolean(existing.profileCompletedAt);

          if (hasExistingProfile && Object.keys(changes).length) {
            const requests = readJson('profile_change_requests.json');
            const pending = requests.find(
              r => r.userId === user.id && r.status === 'PENDING'
            );
            if (pending) {
              return json(res, 409, {
                error: 'A profile change request is already pending admin approval.'
              });
            }
            const request = {
              id: `PCR_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
              userId: user.id,
              changes,
              status: 'PENDING',
              createdAt: new Date().toISOString()
            };
            requests.push(request);
            writeJson('profile_change_requests.json', requests);
            return json(res, 200, {
              message: 'Profile change request sent to admin for approval.',
              request
            });
          }

          Object.assign(users[index], proposed);
          users[index].profileCompletedAt =
            existing.profileCompletedAt || new Date().toISOString();
          users[index].profileStatus = 'COMPLETED';

          writeJson('users.json', users);

          const sid = parseCookies(req).sid;
          if (sid) sessions.set(sid, users[index]);

          return json(res, 200, {
            message: 'Profile saved successfully',
            user: publicUser(users[index])
          });
        }

        // =================================================
        // ADMIN PROFILE CHANGE REQUESTS
        // =================================================

        if (
          req.url === '/api/admin/profile-requests' &&
          req.method === 'GET'
        ) {

          const admin = userFrom(req);

          if (!admin || admin.role !== 'admin') {
            return json(res, 403, { error: 'Admin access required' });
          }

          const requests = readJson('profile_change_requests.json');
          const users = readJson('users.json');

          return json(res, 200, {
            requests: requests.map(r => ({
              ...r,
              investor:
                users.find(u => u.id === r.userId)?.name ||
                r.userId
            }))
          });
        }

        if (
          req.url === '/api/admin/profile-request-status' &&
          req.method === 'POST'
        ) {

          const admin = userFrom(req);

          if (!admin || admin.role !== 'admin') {
            return json(res, 403, { error: 'Admin access required' });
          }

          const b = await body(req);
          const requestId = String(b.requestId || '').trim();
          const newStatus = String(b.status || '').toUpperCase();

          if (
            !requestId ||
            !['APPROVED', 'REJECTED'].includes(newStatus)
          ) {
            return json(res, 400, {
              error: 'Request ID and valid status are required'
            });
          }

          const requests = readJson('profile_change_requests.json');
          const users = readJson('users.json');
          const request = requests.find(r => r.id === requestId);

          if (!request) {
            return json(res, 404, { error: 'Profile request not found' });
          }

          if (request.status !== 'PENDING') {
            return json(res, 400, {
              error: `Request already ${request.status}`
            });
          }

          if (newStatus === 'APPROVED') {
            const investorIndex =
              users.findIndex(u => u.id === request.userId);

            if (investorIndex === -1) {
              return json(res, 404, { error: 'Investor not found' });
            }

            for (const [field, values] of Object.entries(request.changes || {})) {
              users[investorIndex][field] = values.newValue;
            }

            users[investorIndex].profileStatus = 'COMPLETED';
            writeJson('users.json', users);
          }

          request.status = newStatus;
          request.reviewedBy = admin.id;
          request.reviewedAt = new Date().toISOString();

          writeJson('profile_change_requests.json', requests);

          return json(res, 200, {
            message: `Profile request ${newStatus.toLowerCase()}`,
            request
          });
        }

        // =================================================
        // ADMIN CREATE INVESTOR
        // =================================================

        if (
          req.url === '/api/admin/investors' &&
          req.method === 'POST'
        ) {

          const admin = userFrom(req);

          if (!admin || admin.role !== 'admin') {
            return json(res, 403, { error: 'Admin access required' });
          }

          const b = await body(req);

          const id = String(b.id || '').trim().toUpperCase();
          const name = String(b.name || '').trim();
          const email = String(b.email || '').trim().toLowerCase();
          const password = String(b.password || '').trim();
          const sponsorId = String(b.sponsorId || '').trim().toUpperCase();

          if (!/^INV[0-9A-Z_-]{2,20}$/.test(id)) {
            return json(res, 400, {
              error: 'Investor ID must start with INV'
            });
          }

          if (!name || !email || !password) {
            return json(res, 400, {
              error: 'Investor ID, name, email and password are required'
            });
          }

          const users = readJson('users.json');

          if (users.some(u => u.id === id)) {
            return json(res, 409, { error: 'Investor ID already exists' });
          }

          if (
            users.some(
              u =>
                String(u.email || '').toLowerCase() === email
            )
          ) {
            return json(res, 409, { error: 'Email already exists' });
          }

          if (sponsorId) {
            const sponsor = users.find(u => u.id === sponsorId && u.role === 'investor');
            if (!sponsor) return json(res, 404, { error: 'Sponsor investor not found' });
            const count = directDownline(users, sponsorId).length;
            if (count >= 5) return json(res, 400, { error: 'This investor already has 5 direct downline members' });
          }

          const investor = {
            id,
            name,
            email,
            sponsorId: sponsorId || null,
            passwordHash: hashPassword(password),
            role: 'investor',
            status: 'ACTIVE',
            totalInvestment: 0,
            currentBalance: 0,
            profileStatus: 'PENDING'
          };

          users.push(investor);
          writeJson('users.json', users);

          return json(res, 201, {
            message: 'Investor created and approved successfully',
            user: publicUser(investor)
          });
        }

        // =================================================
        // ADMIN INVESTOR SUMMARY
        // =================================================

        if (
          req.url === '/api/admin/investors' &&
          req.method === 'GET'
        ) {

          const admin = userFrom(req);

          if (!admin || admin.role !== 'admin') {
            return json(res, 403, { error: 'Admin access required' });
          }

          const users =
            readJson('users.json')
              .filter(u => u.role === 'investor');

          const transactions =
            readJson('transactions.json');

          const investors =
            users.map(u => {

              const tx =
                transactions.filter(
                  t =>
                    t.userId === u.id &&
                    t.status === 'VERIFIED'
                );

              const deposits =
                tx
                  .filter(
                    t =>
                      t.type === 'DEPOSIT'
                  )
                  .reduce(
                    (s, t) =>
                      s + Number(t.amount || 0),
                    0
                  );

              const withdrawals =
                tx
                  .filter(
                    t =>
                      t.type === 'WITHDRAWAL'
                  )
                  .reduce(
                    (s, t) =>
                      s + Number(t.amount || 0),
                    0
                  );

              const cashback = calculateCashback(u.id, transactions)
                .reduce((sum, x) => sum + x.cashback, 0);
              const tierData = getInvestorTierData(u.id, users);
              return {
                id: u.id,
                name: u.name || '',
                email: u.email || '',
                status: u.status || 'ACTIVE',
                tier: tierData.tier,
                roiRate: tierData.roiRate * 100,
                withdrawalCommissionRate: tierData.withdrawalCommission * 100,
                sponsorId: u.sponsorId || '',
                directDownlineCount: directDownline(users, u.id).length,
                totalDeposit: deposits,
                totalWithdraw: withdrawals,
                currentBalance: Number(u.currentBalance || 0),
                roi: Number(u.todayROI || 0),
                availableToWithdraw: Number(u.withdrawalAllowance || 0),
                cashBack: Number(getAvailableCashback(u.id, transactions).toFixed(2)),
                cashBackEarned: Number(cashback.toFixed(2)),
                levelIncome: getLevelIncomeBalance(u, transactions),
                levelIncomeTotal: getLevelIncomeTotal(u),
                levelIncomeLedger: Array.isArray(u.levelIncomeLedger) ? u.levelIncomeLedger : []
              };
            });

          return json(
            res,
            200,
            { investors }
          );
        }

        // =================================================
        // ADMIN INDIVIDUAL INVESTOR TRANSACTIONS
        // =================================================

        if (
          req.url.startsWith('/api/admin/investor-transactions') &&
          req.method === 'GET'
        ) {

          const admin = userFrom(req);

          if (!admin || admin.role !== 'admin') {
            return json(res, 403, { error: 'Admin access required' });
          }

          const parsed =
            new URL(
              req.url,
              `http://${req.headers.host || 'localhost'}`
            );

          const userId =
            String(
              parsed.searchParams.get('userId') || ''
            ).trim();

          if (!userId) {
            return json(res, 400, {
              error: 'Investor ID is required'
            });
          }

          const users = readJson('users.json');

          const investor =
            users.find(
              u =>
                u.id === userId &&
                u.role === 'investor'
            );

          if (!investor) {
            return json(res, 404, {
              error: 'Investor not found'
            });
          }

          const transactions =
            readJson('transactions.json')
              .filter(
                t =>
                  t.userId === userId
              );

          return json(
            res,
            200,
            {
              investor: {
                ...publicUser(investor),
                cashBack: Number(calculateCashback(investor.id, transactions).reduce((s, x) => s + x.cashback, 0).toFixed(2)),
                availableToWithdraw: Number(investor.withdrawalAllowance || 0),
                roi: Number(investor.todayROI || 0),
                levelIncome: getLevelIncomeBalance(investor, transactions),
                levelIncomeTotal: getLevelIncomeTotal(investor),
                directDownline: directDownline(users, investor.id).map(u => ({ id: u.id, name: u.name || '', totalInvestment: Number(u.totalInvestment || 0) }))
              },
              transactions
            }
          );
        }

        // =================================================
        // ADMIN INVESTOR LOGIN ACCESS / IMPERSONATION
        // =================================================

        if (req.url === '/api/admin/investor-access' && req.method === 'GET') {
          const admin = userFrom(req);
          if (!admin || admin.role !== 'admin') return json(res, 403, { error: 'Admin access required' });
          const users = readJson('users.json').filter(u => u.role === 'investor');
          return json(res, 200, {
            investors: users.map(u => ({
              id: u.id,
              name: u.name || '',
              email: u.email || '',
              status: u.status || 'ACTIVE',
              totalInvestment: Number(u.totalInvestment || 0),
              currentBalance: Number(u.currentBalance || 0)
            }))
          });
        }

        if (req.url === '/api/admin/login-as-investor' && req.method === 'POST') {
          const admin = userFrom(req);
          if (!admin || admin.role !== 'admin') return json(res, 403, { error: 'Admin access required' });
          const b = await body(req);
          const investorId = String(b.investorId || '').trim().toUpperCase();
          if (!investorId) return json(res, 400, { error: 'Investor ID is required' });
          const users = readJson('users.json');
          const investor = users.find(u => u.role === 'investor' && String(u.id).toUpperCase() === investorId);
          if (!investor) return json(res, 404, { error: 'Investor not found' });
          if (String(investor.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return json(res, 400, { error: 'Investor account is not active' });
          const sid = parseCookies(req).sid;
          if (!sid) return json(res, 401, { error: 'Admin session not found' });
          impersonationSessions.set(sid, admin.id);
          sessions.set(sid, investor);
          return json(res, 200, { message: `Logged in as ${investor.id}`, user: publicUser(investor), impersonatingAdmin: true });
        }

        if (req.url === '/api/admin/return' && req.method === 'POST') {
          const sid = parseCookies(req).sid;
          const adminId = sid ? impersonationSessions.get(sid) : null;
          if (!adminId) return json(res, 403, { error: 'No admin impersonation session is active' });
          const users = readJson('users.json');
          const admin = users.find(u => u.id === adminId && u.role === 'admin');
          if (!admin) return json(res, 404, { error: 'Admin account not found' });
          sessions.set(sid, admin);
          impersonationSessions.delete(sid);
          return json(res, 200, { message: 'Returned to Admin Portal', user: publicUser(admin) });
        }

        // =================================================
        // COMPANY PROFIT/LOSS SCREENSHOTS
        // =================================================

        if (
          req.url === '/api/company-profit-loss-images' &&
          req.method === 'GET'
        ) {
          const viewer = userFrom(req);
          if (!viewer) return json(res, 401, { error: 'Authentication required' });

          const records = readJson('company_profit_loss_images.json')
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          return json(res, 200, { images: records });
        }

        if (
          req.url === '/api/company-profit-loss-images' &&
          req.method === 'POST'
        ) {
          const admin = userFrom(req);
          if (!admin || admin.role !== 'admin') return json(res, 403, { error: 'Admin access required' });

          const contentType = req.headers['content-type'] || '';
          if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
            return json(res, 400, { error: 'Profit/loss screenshot is required' });
          }

          let multipart;
          try {
            multipart = await multipartBody(req);
          } catch (error) {
            return json(res, 400, { error: error.message });
          }

          const date = String(multipart.fields.date || new Date().toISOString().slice(0, 10)).trim();
          const note = String(multipart.fields.note || '').trim();
          const image = multipart.files.companyProfitLossImage;

          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return json(res, 400, { error: 'Valid date is required' });
          }

          let filename;
          try {
            filename = saveCompanyProfitLossImage(image);
          } catch (error) {
            return json(res, 400, { error: error.message });
          }

          const records = readJson('company_profit_loss_images.json');
          const record = {
            id: 'CPL_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
            date,
            note,
            imageUrl: `/uploads/${filename}`,
            uploadedBy: admin.id,
            createdAt: new Date().toISOString()
          };
          records.push(record);
          writeJson('company_profit_loss_images.json', records);

          return json(res, 201, { message: 'Company profit/loss screenshot uploaded successfully', image: record });
        }

        // =================================================
        // WITHDRAWAL STATEMENTS
        // =================================================

        if (
          req.url === '/api/withdrawal-statements' &&
          req.method === 'GET'
        ) {
          const viewer = userFrom(req);
          if (!viewer) return json(res, 401, { error: 'Authentication required' });

          const users = readJson('users.json');
          const transactions = readJson('transactions.json');
          const investors = new Map(users.filter(u => u.role === 'investor').map(u => [u.id, u]));

          const withdrawals = transactions
            .filter(t => String(t.type || '').toUpperCase() === 'WITHDRAWAL')
            .filter(t => viewer.role === 'admin' || t.userId === viewer.id)
            .map(t => {
              const investor = investors.get(t.userId) || {};
              return {
                id: t.id,
                investorId: t.userId,
                investorName: investor.name || '',
                amount: Number(t.amount || 0),
                status: String(t.status || 'PENDING').toUpperCase(),
                date: t.date || t.createdAt || '',
                bankName: t.bankName || '',
                accountHolderName: t.accountHolderName || '',
                accountNumber: t.accountNumber || '',
                ifsc: t.ifsc || '',
                verifiedAt: t.verifiedAt || '',
                rejectedAt: t.rejectedAt || ''
              };
            })
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));

          return json(res, 200, { withdrawals });
        }

        // =================================================
        // GET BANK ACCOUNTS
        // =================================================

        if (
          req.url === '/api/bank-accounts' &&
          req.method === 'GET'
        ) {

          const user =
            userFrom(req);

          if (!user) {

            return json(
              res,
              401,
              {
                error:
                  'Login required'
              }
            );
          }

          const accounts =
            readJson(
              'bank_accounts.json'
            );

          let migratedBankStatus = false;
          accounts.forEach(a => {
            if (!a.status) {
              a.status = 'VERIFIED';
              migratedBankStatus = true;
            }
          });
          if (migratedBankStatus) writeJson('bank_accounts.json', accounts);

          const userAccounts =
            user.role === 'admin'
              ? accounts
              : accounts.filter(
                  account =>
                    account.userId ===
                    user.id
                );

          return json(
            res,
            200,
            {
              accounts:
                userAccounts
            }
          );
        }

        // =================================================
        // ADD BANK ACCOUNT
        // =================================================

        if (
          req.url === '/api/bank-accounts' &&
          req.method === 'POST'
        ) {

          const user =
            userFrom(req);

          if (
            !user ||
            !['investor', 'admin'].includes(user.role)
          ) {
            return json(
              res,
              403,
              {
                error: 'Investor or Admin access required'
              }
            );
          }

          const b =
            await body(req);

          const accountHolderName =
            String(
              b.accountHolderName || ''
            ).trim();

          const bankName =
            String(
              b.bankName || ''
            ).trim();

          const accountNumber =
            String(
              b.accountNumber || ''
            )
              .replace(/\s/g, '')
              .trim();

          const ifsc =
            String(
              b.ifsc || ''
            )
              .trim()
              .toUpperCase();

          const upiId = String(b.upiId || '').trim().toLowerCase();
          const method = String(b.method || 'BANK').trim().toUpperCase();

          if (!['BANK','UPI'].includes(method)) {
            return json(res, 400, { error: 'Invalid payment method' });
          }

          if (method === 'UPI' && !upiId) {
            return json(res, 400, { error: 'UPI ID is required' });
          }

          if (method === 'UPI' && !/^[^\s@]+@[^\s@]+$/.test(upiId)) {
            return json(res, 400, { error: 'Enter a valid UPI ID' });
          }

          if (!accountHolderName) {

            return json(
              res,
              400,
              {
                error:
                  'Account holder name is required'
              }
            );
          }

          if (method === 'BANK' && !bankName) {
            return json(res, 400, { error: 'Bank name is required' });
          }

          if (method === 'BANK' && !accountNumber) {
            return json(res, 400, { error: 'Account number is required' });
          }

          if (method === 'BANK' && !/^[0-9]{6,30}$/.test(accountNumber)) {
            return json(res, 400, { error: 'Enter a valid account number' });
          }

          if (method === 'BANK' && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
            return json(res, 400, { error: 'Enter a valid IFSC code' });
          }

          const accounts =
            readJson(
              'bank_accounts.json'
            );

          const userAccounts =
            accounts.filter(
              account =>
                account.userId ===
                user.id
            );

          if (
            userAccounts.length >= 4
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Maximum 4 bank accounts allowed'
              }
            );
          }

          const duplicate =
            userAccounts.find(
              account =>
                account.accountNumber ===
                accountNumber
            );

          if (duplicate) {

            return json(
              res,
              400,
              {
                error:
                  'This bank account is already added'
              }
            );
          }

          const account = {

            id:
              'BANK_' +
              Date.now() +
              '_' +
              crypto
                .randomBytes(4)
                .toString('hex'),

            userId:
              user.id,

            accountHolderName,

            bankName,

            accountNumber,
            ifsc,
            method,
            upiId,
            status: 'PENDING',
            isPrimary:
              userAccounts.length === 0,

            createdAt:
              new Date().toISOString()
          };

          accounts.push(
            account
          );

          writeJson(
            'bank_accounts.json',
            accounts
          );

          return json(
            res,
            201,
            {
              message:
                'Bank account added successfully',

              account
            }
          );
        }

        // ============================================================
        
// ============================================================
// ADMIN BANK / UPI APPROVAL
// ============================================================

if (
  req.url === '/api/admin/bank-account-status' &&
  req.method === 'POST'
) {
  const admin = userFrom(req);
  if (!admin || admin.role !== 'admin') return json(res, 403, { error: 'Admin access required' });

  const b = await body(req);
  const accountId = String(b.accountId || '').trim();
  const status = String(b.status || '').trim().toUpperCase();
  if (!accountId || !['VERIFIED','REJECTED'].includes(status)) {
    return json(res, 400, { error: 'Account ID and valid status are required' });
  }

  const accounts = readJson('bank_accounts.json');
  const account = accounts.find(a => a.id === accountId);
  if (!account) return json(res, 404, { error: 'Bank account not found' });

  account.status = status;
  account.verifiedBy = admin.id;
  account.verifiedAt = new Date().toISOString();
  writeJson('bank_accounts.json', accounts);

  return json(res, 200, { message: `Bank account ${status.toLowerCase()} successfully`, account });
}

// UPDATE BANK ACCOUNT
        // ============================================================

        if (
            req.url.startsWith('/api/bank-accounts/') &&
            req.method === 'PUT'
        ) {
            const user = userFrom(req);

            if (
                !user ||
                !['investor', 'admin'].includes(user.role)
            ) {
                return json(res, 403, {
                    error: 'Investor or Admin access required'
                });
            }

            const accountId = decodeURIComponent(
                req.url
                    .split('?')[0]
                    .replace('/api/bank-accounts/', '')
            );

            if (!accountId) {
                return json(res, 400, {
                    error: 'Bank account ID required'
                });
            }

            const b = await body(req);

            const accounts = readJson('bank_accounts.json');

            const index = accounts.findIndex(
                account =>
                    account.id === accountId &&
                    account.userId === user.id
            );

            if (index === -1) {
                return json(res, 404, {
                    error: 'Bank account not found'
                });
            }

            const account = accounts[index];

            if (b.accountHolderName !== undefined) {
                account.accountHolderName =
                    String(b.accountHolderName).trim();
            }

            if (b.bankName !== undefined) {
                account.bankName =
                    String(b.bankName).trim();
            }

            if (b.accountNumber !== undefined) {
                account.accountNumber =
                    String(b.accountNumber).trim();
            }

            if (b.ifsc !== undefined) {
                account.ifsc =
                    String(b.ifsc).trim().toUpperCase();
            }

            writeJson('bank_accounts.json', accounts);

            return json(res, 200, {
                message: 'Bank account updated successfully',
                account
            });
        }

        // =================================================
        // DELETE BANK ACCOUNT
        // =================================================

        if (
          req.url.startsWith('/api/bank-accounts/') &&
          req.method === 'DELETE'
        ) {

          const user = userFrom(req);

          // Investor OR Admin allowed
          if (
            !user || 
            !['investor', 'admin'].includes(user.role)
          ) {
            return json(
              res,
              403,
              {
                error: 'Investor or Admin access required'
              }
            );
          }

          const accountId =
            decodeURIComponent(
              req.url
                .split('?')[0]
                .replace('/api/bank-accounts/', '')
            );

          if (!accountId) {
            return json(
              res,
              400,
              {
                error: 'Bank account ID required'
              }
            );
          }

          const accounts =
            readJson('bank_accounts.json');

          const index =
            accounts.findIndex(account => {

              // Admin can delete any bank account
              if (user.role === 'admin') {
                return account.id === accountId;
              }

              // Investor can delete only own account
              return (
                account.id === accountId &&
                account.userId === user.id
              );
            });

          if (index === -1) {
            return json(
              res,
              404,
              {
                error: 'Bank account not found'
              }
            );
          }

          const wasPrimary =
            accounts[index].isPrimary;

          const deletedUserId =
            accounts[index].userId;

          accounts.splice(index, 1);

          // If deleted account was primary,
          // make another account of same investor primary
          if (wasPrimary) {

            const remaining =
              accounts.filter(
                account =>
                  account.userId === deletedUserId
              );

            if (remaining.length > 0) {
              remaining[0].isPrimary = true;
            }
          }

          writeJson(
            'bank_accounts.json',
            accounts
          );

          return json(
            res,
            200,
            {
              message:
                'Bank account deleted successfully'
            }
          );
        }
        

        // =================================================
        // DASHBOARD
        // =================================================

        if (
          req.url === '/api/dashboard' &&
          req.method === 'GET'
        ) {

          const user =
            userFrom(req);

          if (!user) {

            return json(
              res,
              401,
              {
                error:
                  'Not logged in'
              }
            );
          }

          const transactions =
            readJson(
              'transactions.json'
            ).filter(
              transaction =>
                user.role === 'admin'
                  ? true
                  : transaction.userId === user.id
            );

          const users =
            readJson(
              'users.json'
            );

          const roiChanged = applyDailyRoiAndLevels(users, transactions);
          if (roiChanged) {
            writeJson('users.json', users);
          }

          // =================================================
          // ADMIN STATS
          // =================================================

          const stats =
            user.role === 'admin'
              ? {

                  investors:
                    users.filter(
                      x =>
                        x.role === 'investor'
                    ).length,

                  silverInvestors:
                    users.filter(x => x.role === 'investor' && getInvestorTierData(x.id, users).tier === 'Silver').length,

                  goldInvestors:
                    users.filter(x => x.role === 'investor' && getInvestorTierData(x.id, users).tier === 'Gold').length,

                  // IMPORTANT:
                  // Total Capital = CURRENT BALANCE
                  // Withdrawal verified amount is already
                  // deducted from currentBalance.

                  totalCapital:
                    users
                      .filter(
                        x =>
                          x.role === 'investor'
                      )
                      .reduce(
                        (
                          total,
                          x
                        ) =>
                          total +
                          Number(
                            x.currentBalance || 0
                          ),
                        0
                      ),

                  verifiedDeposits:
                    transactions
                      .filter(
                        x =>
                          x.type === 'DEPOSIT' &&
                          x.status === 'VERIFIED'
                      )
                      .reduce(
                        (
                          total,
                          x
                        ) =>
                          total +
                          Number(
                            x.amount || 0
                          ),
                        0
                      ),

                  pending:
                    transactions.filter(
                      x =>
                        x.status === 'PENDING'
                    ).length,

                  pendingDepositAmount:
                    transactions
                      .filter(x => x.type === 'DEPOSIT' && x.status === 'PENDING')
                      .reduce((total, x) => total + Number(x.amount || 0), 0),

                  pendingWithdrawalAmount:
                    transactions
                      .filter(x => ['WITHDRAWAL', 'CASHBACK_WITHDRAWAL', 'LEVEL_INCOME_WITHDRAWAL'].includes(String(x.type || '').toUpperCase()) && x.status === 'PENDING')
                      .reduce((total, x) => total + Number(x.amount || 0), 0),

                  verifiedCompanyCommission:
                    transactions
                      .filter(x => x.type === 'WITHDRAWAL' && x.status === 'VERIFIED')
                      .reduce((total, x) => total + Number(x.companyCommission || 0), 0),

                  totalRoi:
                    users
                      .filter(x => x.role === 'investor')
                      .reduce((total, x) => total + (Array.isArray(x.roiHistory) ? x.roiHistory : []).reduce((sum, row) => sum + Number(row.amount || 0), 0), 0)

                }

              : null;

          // =================================================
          // FRESH USER DATA
          // =================================================

          const freshUser =
            users.find(
              x =>
                x.id === user.id
            ) ||
            user;

          const sid =
            parseCookies(req).sid;

          if (sid) {

            sessions.set(
              sid,
              freshUser
            );
          }

          const dashboardUser = publicUser(freshUser);
          if (freshUser.role === 'investor') {
            const txAll = readJson('transactions.json');
            dashboardUser.cashbackRecords = calculateCashback(freshUser.id, txAll);
            dashboardUser.cashbackAvailable = getAvailableCashback(freshUser.id, txAll);
            dashboardUser.levelIncomeTotal = getLevelIncomeTotal(freshUser);
            dashboardUser.levelIncomeBalance = getLevelIncomeBalance(freshUser, txAll);
            dashboardUser.levelIncomeLedger = Array.isArray(freshUser.levelIncomeLedger) ? freshUser.levelIncomeLedger : [];
            const tierData = getInvestorTierData(freshUser.id, users);
            dashboardUser.tier = tierData.tier;
            dashboardUser.roiRate = tierData.roiRate * 100;
            dashboardUser.withdrawalCommissionRate = tierData.withdrawalCommission * 100;
            dashboardUser.tierData = tierData;
            dashboardUser.roiHistory = Array.isArray(freshUser.roiHistory) ? freshUser.roiHistory : [];
            dashboardUser.downlineDetails = buildDownlineIncomeDetails(freshUser.id, users, freshUser.levelIncomeLedger || []);
            const targetProgress = getTargetProgress(freshUser.id, txAll);
            if (syncTargetStatus(freshUser, txAll)) writeJson('users.json', users);
            dashboardUser.targetAchieved = targetProgress.achieved;
            dashboardUser.targetAchievedAt = freshUser.targetAchievedAt || null;
            dashboardUser.targetDepositTotal = targetProgress.depositTotal;
            dashboardUser.targetAmount = targetProgress.targetAmount;
            dashboardUser.targetWithdrawn = targetProgress.withdrawn;
            dashboardUser.targetRemaining = targetProgress.remaining;
            dashboardUser.targetWithdrawals = targetProgress.withdrawals;
          }

          if (sid && impersonationSessions.has(sid)) {
            dashboardUser.impersonatingAdmin = true;
          }

          return json(
            res,
            200,
            {
              user: dashboardUser,
              transactions,
              stats
            }
          );
        }
        // =================================================
        // DEPOSIT REQUEST
        // =================================================

        if (
          req.url ===
            '/api/deposit-request' &&
          req.method === 'POST'
        ) {

          const user =
            userFrom(req);

          if (
            !user ||
            user.role !== 'investor'
          ) {

            return json(
              res,
              403,
              {
                error:
                  'Investor access required'
              }
            );
          }

          const depositUsers = readJson('users.json');
          const depositInvestor = depositUsers.find(u => u.id === user.id);
          if (depositInvestor && (depositInvestor.targetAchieved || String(depositInvestor.status || '').toUpperCase() === 'CLOSED')) {
            return json(res, 400, { error: 'Target Achieved. This investor account is closed and new deposits are not allowed.' });
          }

          const contentType =
            req.headers[
              'content-type'
            ] || '';

          if (
            !contentType
              .toLowerCase()
              .startsWith(
                'multipart/form-data'
              )
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Deposit request must include UTR and payment screenshot'
              }
            );
          }

          let multipart;

          try {

            multipart =
              await multipartBody(
                req
              );

          } catch (error) {

            return json(
              res,
              400,
              {
                error:
                  error.message
              }
            );
          }

          const amount =
            Number(
              multipart.fields.amount
            );

          const utrNumber =
            String(
              multipart.fields.utrNumber ||
              ''
            ).trim();

          const screenshot =
            multipart.files
              .paymentScreenshot;

          if (
            !Number.isFinite(
              amount
            ) ||
            amount < 10000
          ) {
            return json(res, 400, {
              error: 'Minimum deposit is ₹10,000'
            });
          }

          if (!utrNumber) {

            return json(
              res,
              400,
              {
                error:
                  'UTR / Transaction Number is required'
              }
            );
          }

          if (
            utrNumber.length >
            100
          ) {

            return json(
              res,
              400,
              {
                error:
                  'UTR / Transaction Number is too long'
              }
            );
          }

          let screenshotFilename;

          try {

            screenshotFilename =
              savePaymentScreenshot(
                screenshot
              );

          } catch (error) {

            return json(
              res,
              400,
              {
                error:
                  error.message
              }
            );
          }

          const transactions =
            readJson(
              'transactions.json'
            );

          // Deposit requests do not use withdrawal commission.
          // The authenticated investor is available as `user` in this route.

          const tx = {

            id:
              'TXN_' +
              Date.now() +
              '_' +
              crypto
                .randomBytes(4)
                .toString('hex'),

            userId:
              user.id,

            type:
              'DEPOSIT',

            amount,

            utrNumber,

            paymentScreenshot:
              `/uploads/${screenshotFilename}`,

            status:
              'PENDING',

            date:
              new Date()
                .toISOString()
                .slice(
                  0,
                  10
                ),

            createdAt:
              new Date()
                .toISOString()
          };

          transactions.push(
            tx
          );

          writeJson(
            'transactions.json',
            transactions
          );

          return json(
            res,
            201,
            {
              message:
                'Deposit request submitted for admin verification',

              transaction:
                tx
            }
          );
        }

        // =================================================
        // WITHDRAWAL REQUEST
        // =================================================

        if (
          req.url === '/api/withdrawal-request' &&
          req.method === 'POST'
        ) {

          const user =
            userFrom(req);

          // -------------------------------------------------
          // INVESTOR ACCESS
          // -------------------------------------------------

          if (
            !user ||
            user.role !== 'investor'
          ) {

            return json(
              res,
              403,
              {
                error:
                  'Investor access required'
              }
            );
          }

          // -------------------------------------------------
          // READ REQUEST BODY
          // -------------------------------------------------

          let b;

          try {

            b =
              await body(req);

          } catch (error) {

            return json(
              res,
              400,
              {
                error:
                  error.message ||
                  'Invalid withdrawal request'
              }
            );
          }

          // -------------------------------------------------
          // AMOUNT
          // -------------------------------------------------

          const amount =
            Number(
              b.amount
            );

          if (isIndiaWeekend() || indiaMinutes() < 990 || indiaMinutes() > 1410) {
            return json(res, 400, { error: 'Withdrawals are available Monday-Friday, 4:30 PM-11:30 PM IST only' });
          }

          if (
            !Number.isFinite(amount) ||
            amount <= 0
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Enter a valid withdrawal amount'
              }
            );
          }

          // -------------------------------------------------
          // BANK ACCOUNT ID
          // -------------------------------------------------

          const bankAccountId =
            String(
              b.bankAccountId ||
              b.bankAccount ||
              ''
            ).trim();

          if (!bankAccountId) {

            return json(
              res,
              400,
              {
                error:
                  'Please select a withdrawal bank account'
              }
            );
          }

          // -------------------------------------------------
          // LOAD BANK ACCOUNTS
          // -------------------------------------------------

          const accounts =
            readJson(
              'bank_accounts.json'
            );

          // -------------------------------------------------
          // FIND ONLY THIS INVESTOR'S ACCOUNT
          // -------------------------------------------------

          const bankAccount =
            accounts.find(
              account =>
                account.id ===
                  bankAccountId &&
                account.userId ===
                  user.id
            );

          if (!bankAccount) {
            return json(res, 404, { error: 'Selected bank account was not found' });
          }

          if (String(bankAccount.status || 'PENDING').toUpperCase() !== 'VERIFIED') {
            return json(res, 400, { error: 'Selected bank account is awaiting admin approval' });
          }

          // -------------------------------------------------
          // LOAD USERS
          // -------------------------------------------------

          const users =
            readJson(
              'users.json'
            );

          const investor =
            users.find(
              x =>
                x.id ===
                user.id
            );

          if (!investor) {

            return json(
              res,
              404,
              {
                error:
                  'Investor not found'
              }
            );
          }

          // -------------------------------------------------
          // CURRENT BALANCE
          // -------------------------------------------------

          const currentBalance =
            Number(
              investor.currentBalance ||
              0
            );

          if (
            !Number.isFinite(
              currentBalance
            )
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Invalid investor balance'
              }
            );
          }

          // -------------------------------------------------
          // LOAD TRANSACTIONS
          // -------------------------------------------------

          const transactions =
            readJson(
              'transactions.json'
            );

          if (syncTargetStatus(investor, transactions)) writeJson('users.json', users);
          if (investor.targetAchieved || String(investor.status || '').toUpperCase() === 'CLOSED') {
            return json(res, 400, { error: 'Target Achieved. This investor account is closed.' });
          }

          // -------------------------------------------------
          // EXISTING PENDING WITHDRAWALS
          // -------------------------------------------------

          const pendingWithdrawals =
            transactions
              .filter(
                transaction =>
                  transaction.userId ===
                    user.id &&
                  transaction.type ===
                    'WITHDRAWAL' &&
                  transaction.status ===
                    'PENDING'
              )
              .reduce(
                (
                  total,
                  transaction
                ) =>
                  total +
                  Number(
                    transaction.amount ||
                    0
                  ),
                0
              );

          // -------------------------------------------------
          // AVAILABLE BALANCE
          // -------------------------------------------------

          const availableBalance =
            currentBalance -
            pendingWithdrawals;

          const withdrawalAllowance = Math.max(0, Number(investor.withdrawalAllowance || 0));

          if (amount > withdrawalAllowance) {
            return json(res, 400, {
              error: `Insufficient Available to Withdraw. Available: ₹${withdrawalAllowance.toFixed(2)}`
            });
          }

          if (amount > availableBalance) {
            return json(res, 400, {
              error: `Insufficient current balance. Available: ₹${availableBalance.toFixed(2)}`
            });
          }

          // -------------------------------------------------
          // CREATE TRANSACTION
          // -------------------------------------------------

          const now =
            new Date()
              .toISOString();

          const tx = {

            id:
              'TXN_' +
              Date.now() +
              '_' +
              crypto
                .randomBytes(4)
                .toString('hex'),

            userId:
              user.id,

            type:
              'WITHDRAWAL',

            amount,
            companyCommission,
            netAmount,
            investorTier: tierData.tier,
            companyCommissionRate: tierData.withdrawalCommission * 100,

            status:
              'PENDING',

            date:
              now.slice(
                0,
                10
              ),

            createdAt:
              now,

            // -----------------------------------------------
            // BANK ACCOUNT DETAILS
            // -----------------------------------------------

            bankAccountId:
              bankAccount.id,

            bankName:
              bankAccount.bankName,

            accountHolderName:
              bankAccount.accountHolderName,

            accountNumber:
              bankAccount.accountNumber,

            ifsc:
              bankAccount.ifsc
          };

          // -------------------------------------------------
          // DEDUCT AT REQUEST TIME — DO NOT DEDUCT AGAIN ON APPROVAL
          // -------------------------------------------------
          investor.currentBalance = Number((currentBalance - amount).toFixed(2));
          investor.withdrawalAllowance = Number((withdrawalAllowance - amount).toFixed(2));
          tx.withdrawalDeducted = true;

          // -------------------------------------------------
          // SAVE TRANSACTION
          // -------------------------------------------------

          transactions.push(tx);
          writeJson('users.json', users);

          writeJson(
            'transactions.json',
            transactions
          );

          // -------------------------------------------------
          // RESPONSE
          // -------------------------------------------------

          return json(
            res,
            201,
            {
              message:
                'Withdrawal request submitted for admin verification',

              transaction:
                tx
            }
          );
        }


        // =================================================
        // ADMIN TRANSACTION STATUS
        // =================================================

        if (
          req.url ===
            '/api/admin/transaction-status' &&
          req.method === 'POST'
        ) {

          const admin =
            userFrom(req);

          // -------------------------------------------------
          // ADMIN ACCESS
          // -------------------------------------------------

          if (
            !admin ||
            admin.role !== 'admin'
          ) {

            return json(
              res,
              403,
              {
                error:
                  'Admin access required'
              }
            );
          }

          // -------------------------------------------------
          // REQUEST BODY
          // -------------------------------------------------

          let b;

          try {

            b =
              await body(req);

          } catch (error) {

            return json(
              res,
              400,
              {
                error:
                  error.message ||
                  'Invalid request'
              }
            );
          }

          const transactionId =
            String(
              b.id ||
              ''
            ).trim();

          const newStatus =
            String(
              b.status ||
              ''
            )
              .trim()
              .toUpperCase();

          const adminProof = b.adminProof || null;    

          // -------------------------------------------------
          // VALIDATE TRANSACTION ID
          // -------------------------------------------------

          if (!transactionId) {

            return json(
              res,
              400,
              {
                error:
                  'Transaction ID required'
              }
            );
          }

          // -------------------------------------------------
          // VALIDATE STATUS
          // -------------------------------------------------

          if (
            ![
              'VERIFIED',
              'REJECTED'
            ].includes(
              newStatus
            )
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Invalid status'
              }
            );
          }

          // -------------------------------------------------
          // LOAD DATA
          // -------------------------------------------------

          const transactions =
            readJson(
              'transactions.json'
            );

          const users =
            readJson(
              'users.json'
            );

          // -------------------------------------------------
          // FIND TRANSACTION
          // -------------------------------------------------

          const transaction =
            transactions.find(
              x =>
                x.id ===
                transactionId
            );

          if (!transaction) {

            return json(
              res,
              404,
              {
                error:
                  'Transaction not found'
              }
            );
          }

          // -------------------------------------------------
          // ONLY PENDING TRANSACTIONS
          // -------------------------------------------------

          if (
            transaction.status !==
            'PENDING'
          ) {

            return json(
              res,
              400,
              {
                error:
                  `Transaction already ${transaction.status}`
              }
            );
          }

          // =================================================
          // ADMIN PROOF REQUIRED ONLY FOR WITHDRAWAL
          // =================================================

          if (
              transaction.type === 'WITHDRAWAL' &&
              newStatus === 'VERIFIED'
          ) {

              if (
                  !adminProof ||
                  !adminProof.data
              ) {

                  return json(
                      res,
                      400,
                      {
                          error:
                              'Admin proof screenshot is required before verification'
                      }
                  );
              }
          }

          // -------------------------------------------------
          // FIND INVESTOR
          // -------------------------------------------------

          const investor =
            users.find(
              x =>
                x.id ===
                transaction.userId
            );

          if (!investor) {

            return json(
              res,
              404,
              {
                error:
                  'Investor not found'
              }
            );
          }

          // -------------------------------------------------
          // VALIDATE AMOUNT
          // -------------------------------------------------

          const amount =
            Number(
              transaction.amount
            );

          if (
            !Number.isFinite(
              amount
            ) ||
            amount <= 0
          ) {

            return json(
              res,
              400,
              {
                error:
                  'Invalid transaction amount'
              }
            );
          }

          // =================================================
          // VERIFY DEPOSIT
          // =================================================

          if (
            transaction.type ===
              'DEPOSIT' &&
            newStatus ===
              'VERIFIED'
          ) {

            investor.totalInvestment =
              Number(
                investor.totalInvestment ||
                0
              ) +
              amount;

            investor.currentBalance =
              Number(
                investor.currentBalance ||
                0
              ) +
              amount;

            transaction.status =
              'VERIFIED';

            transaction.verifiedBy =
              admin.id;

            transaction.verifiedAt =
              new Date()
                .toISOString();

            writeJson(
              'users.json',
              users
            );

            writeJson(
              'transactions.json',
              transactions
            );

            try {
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (telegramChatId) {
        await sendTelegramMessage(
            telegramChatId,
            `SPARTNER DEPOSIT VERIFIED

Investor ID: ${investor.id}
Investor Name: ${investor.name || ''}
Amount: ₹${Number(amount || 0).toLocaleString('en-IN')}

Total Investment: ₹${Number(investor.totalInvestment || 0).toLocaleString('en-IN')}
Current Balance: ₹${Number(investor.currentBalance || 0).toLocaleString('en-IN')}

Status: VERIFIED
Verified By: ${admin.id}
Time: ${new Date().toLocaleString('en-IN')}`
        );
    }
} catch (telegramError) {
    console.error('Telegram notification failed:', telegramError.message);
}

            return json(
              res,
              200,
              {
                message:
                  'Deposit verified successfully',

                transaction,

                investor: {

                  id:
                    investor.id,

                  totalInvestment:
                    investor.totalInvestment,

                  currentBalance:
                    investor.currentBalance
                }
              }
            );
          }

          // =================================================
          // VERIFY WITHDRAWAL
          // =================================================

          if (
            transaction.type ===
              'WITHDRAWAL' &&
            newStatus ===
              'VERIFIED'
          ) {

            // -----------------------------------------------
            // CURRENT BALANCE
            // -----------------------------------------------

            const currentBalance =
              Number(
                investor.currentBalance ||
                0
              );

            // -----------------------------------------------
            // CHECK OTHER PENDING WITHDRAWALS
            // -----------------------------------------------

            const pendingOtherWithdrawals =
              transactions
                .filter(
                  x =>
                    x.id !==
                      transaction.id &&
                    x.userId ===
                      investor.id &&
                    x.type ===
                      'WITHDRAWAL' &&
                    x.status ===
                      'PENDING'
                )
                .reduce(
                  (
                    total,
                    x
                  ) =>
                    total +
                    Number(
                      x.amount ||
                      0
                    ),
                  0
                );

            // -----------------------------------------------
            // AVAILABLE BALANCE
            // -----------------------------------------------

            const availableBalance =
              currentBalance -
              pendingOtherWithdrawals;

            // -----------------------------------------------
            // FINAL BALANCE CHECK
            // -----------------------------------------------

            if (
              amount >
              availableBalance
            ) {

              return json(
                res,
                400,
                {
                  error:
                    `Insufficient investor balance. Available: ₹${availableBalance}`
                }
              );
            }

            // -----------------------------------------------
            // DEDUCT BALANCE ONLY IF NOT ALREADY DEDUCTED
            // -----------------------------------------------
            if (!transaction.withdrawalDeducted) {
              investor.currentBalance = currentBalance - amount;
              investor.withdrawalAllowance = Math.max(0, Number(investor.withdrawalAllowance || 0) - amount);
              transaction.withdrawalDeducted = true;
            }

            // -----------------------------------------------
            // UPDATE TRANSACTION
            // -----------------------------------------------


            if (adminProof && adminProof.data) {
                transaction.adminProof = {
                    fileName: String(
                        adminProof.fileName || "admin-proof"
                    ),
                    data: adminProof.data,
                    uploadedBy: admin.id,
                    uploadedAt: new Date().toISOString()
                };
            }

            transaction.status =
              'VERIFIED';

            transaction.verifiedBy =
              admin.id;

            transaction.verifiedAt =
              new Date()
                .toISOString();

            // A verified ROI withdrawal counts toward the investor's 2× deposit target.
            syncTargetStatus(investor, transactions);

            // -----------------------------------------------
            // SAVE
            // -----------------------------------------------

            writeJson(
              'users.json',
              users
            );

            writeJson(
              'transactions.json',
              transactions
            );

            try {
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (telegramChatId) {
    await sendTelegramMessage(
      telegramChatId,
      `SPARTNER WITHDRAWAL VERIFIED

Investor ID: ${investor.id}
Investor Name: ${investor.name || ''}
Amount: ₹${Number(amount || 0).toLocaleString('en-IN')}

Total Investment: ₹${Number(investor.totalInvestment || 0).toLocaleString('en-IN')}
Current Balance: ₹${Number(investor.currentBalance || 0).toLocaleString('en-IN')}

Status: VERIFIED
Verified By: ${admin.id}
Time: ${new Date().toLocaleString('en-IN')}`
    );
  }
} catch (telegramError) {
  console.error(
    'Telegram withdrawal notification failed:',
    telegramError.message
  );
}

            // -----------------------------------------------
            // RESPONSE
            // -----------------------------------------------

            return json(
              res,
              200,
              {
                message:
                  'Withdrawal verified successfully',

                transaction,

                investor: {

                  id:
                    investor.id,

                  totalInvestment:
                    investor.totalInvestment,

                  currentBalance:
                    investor.currentBalance
                }
              }
            );
          }

          // =================================================
          // REJECT TRANSACTION
          // =================================================

          if (
            newStatus ===
            'REJECTED'
          ) {

            if (transaction.type === 'WITHDRAWAL' && transaction.withdrawalDeducted) {
              const rejectInvestor = users.find(u => u.id === transaction.userId);
              if (rejectInvestor) {
                rejectInvestor.currentBalance = Number((Number(rejectInvestor.currentBalance || 0) + Number(transaction.amount || 0)).toFixed(2));
                rejectInvestor.withdrawalAllowance = Number((Number(rejectInvestor.withdrawalAllowance || 0) + Number(transaction.amount || 0)).toFixed(2));
                transaction.withdrawalRestored = true;
                writeJson('users.json', users);
              }
            }

            transaction.status =
              'REJECTED';

            transaction.rejectedBy =
              admin.id;

            transaction.rejectedAt =
              new Date()
                .toISOString();

            writeJson(
              'transactions.json',
              transactions
            );

            return json(
              res,
              200,
              {
                message:
                  `${transaction.type} rejected successfully`,

                transaction
              }
            );
          }

          // -------------------------------------------------
          // UNSUPPORTED
          // -------------------------------------------------

          return json(
            res,
            400,
            {
              error:
                'Unsupported transaction type'
            }
          );
        }


        // =================================================
        
// ============================================================

// CASH BACK / LEVEL INCOME WITHDRAWAL REQUESTS
// ============================================================

if (req.url === '/api/cashback-withdrawal-request' && req.method === 'POST') {
  const user = userFrom(req);
  if (!user || user.role !== 'investor') return json(res, 403, { error: 'Investor access required' });

  const b = await body(req);
  const amount = Number(b.amount);
  const transactions = readJson('transactions.json');
  const available = getAvailableCashback(user.id, transactions);

  const todayName = indiaDayNumber();
  if (todayName !== 'Mon') return json(res, 400, { error: 'Cash Back withdrawals are available on Monday only' });

  if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: 'Enter a valid cashback withdrawal amount' });
  if (amount > available) return json(res, 400, { error: `Available Cash Back: ₹${available.toFixed(2)}` });

  const now = new Date().toISOString();
  const tx = {
    id: 'CBW_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    userId: user.id,
    type: 'CASHBACK_WITHDRAWAL',
    amount,
    status: 'PENDING',
    date: now.slice(0,10),
    createdAt: now,
    note: 'Cash Back withdrawal request — no balance deduction'
  };
  transactions.push(tx);
  writeJson('transactions.json', transactions);
  return json(res, 201, { message: 'Cash Back withdrawal request submitted for approval', transaction: tx });
}

if (req.url === '/api/level-income-withdrawal-request' && req.method === 'POST') {
  const user = userFrom(req);
  if (!user || user.role !== 'investor') return json(res, 403, { error: 'Investor access required' });

  const b = await body(req);
  const amount = Number(b.amount);
  const users = readJson('users.json');
  const transactions = readJson('transactions.json');
  const investor = users.find(u => u.id === user.id);
  if (!investor) return json(res, 404, { error: 'Investor not found' });
  if (syncTargetStatus(investor, transactions)) writeJson('users.json', users);
  if (investor.targetAchieved || String(investor.status || '').toUpperCase() === 'CLOSED') {
    return json(res, 400, { error: 'Target Achieved. This investor account is closed.' });
  }

  const levelDay = indiaDayNumber();
  const levelMinutes = indiaMinutes();
  if (!['Fri', 'Sat', 'Sun'].includes(levelDay) || levelMinutes < 990 || levelMinutes > 1410) {
    return json(res, 400, { error: 'Level Income withdrawals are available Friday-Sunday, 4:30 PM-11:30 PM IST only' });
  }

  const balance = getLevelIncomeRequestAvailable(investor, transactions);

  if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: 'Enter a valid level income withdrawal amount' });
  if (amount > balance) return json(res, 400, { error: `Available Level Income: ₹${balance.toFixed(2)}` });

  const nextAt = investor.levelIncomeNextWithdrawAt ? new Date(investor.levelIncomeNextWithdrawAt) : null;
  if (nextAt && Date.now() < nextAt.getTime()) {
    return json(res, 400, { error: `Unable to Withdraw. Next withdrawal available on ${nextAt.toLocaleDateString('en-IN')}` });
  }

  const now = new Date().toISOString();
  const tx = {
    id: 'LIW_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    userId: user.id,
    type: 'LEVEL_INCOME_WITHDRAWAL',
    amount,
    status: 'PENDING',
    date: now.slice(0,10),
    createdAt: now,
    note: 'Level Income withdrawal request — no balance deduction'
  };
  transactions.push(tx);
  investor.levelIncomeNextWithdrawAt = new Date(Date.now() + 10 * 86400000).toISOString();
  writeJson('transactions.json', transactions);
  writeJson('users.json', users);
  return json(res, 201, { message: 'Level Income withdrawal request submitted for approval', transaction: tx });
}

if (req.url === '/api/admin/special-withdrawal-status' && req.method === 'POST') {
  const admin = userFrom(req);
  if (!admin || admin.role !== 'admin') return json(res, 403, { error: 'Admin access required' });

  const b = await body(req);
  const transactionId = String(b.id || '').trim();
  const status = String(b.status || '').trim().toUpperCase();
  const adminProof = b.adminProof || null;
  if (!transactionId || !['VERIFIED','REJECTED'].includes(status)) return json(res, 400, { error: 'Transaction ID and valid status are required' });

  const transactions = readJson('transactions.json');
  const users = readJson('users.json');
  const tx = transactions.find(t => t.id === transactionId);
  if (!tx || !['CASHBACK_WITHDRAWAL','LEVEL_INCOME_WITHDRAWAL'].includes(String(tx.type || '').toUpperCase())) {
    return json(res, 404, { error: 'Special withdrawal request not found' });
  }
  if (tx.status !== 'PENDING') return json(res, 400, { error: `Transaction already ${tx.status}` });

  if (status === 'VERIFIED' && (!adminProof || !adminProof.data)) {
    return json(res, 400, { error: 'Admin payment proof screenshot is required before approval' });
  }

  tx.status = status;
  if (status === 'VERIFIED') {
    tx.verifiedBy = admin.id;
    tx.verifiedAt = new Date().toISOString();
    if (adminProof?.data) {
      tx.adminProof = {
        fileName: String(adminProof.fileName || 'admin-proof'),
        data: adminProof.data,
        uploadedBy: admin.id,
        uploadedAt: new Date().toISOString()
      };
    }
  } else {
    tx.rejectedBy = admin.id;
    tx.rejectedAt = new Date().toISOString();
  }

  if (status === 'VERIFIED' && String(tx.type || '').toUpperCase() === 'LEVEL_INCOME_WITHDRAWAL') {
    const targetInvestor = users.find(u => u.id === tx.userId);
    if (targetInvestor) syncTargetStatus(targetInvestor, transactions);
    writeJson('users.json', users);
  }
  writeJson('transactions.json', transactions);
  return json(res, 200, { message: `${tx.type} ${status.toLowerCase()} successfully`, transaction: tx });
}

if (req.url === '/api/investor/cashback-levels' && req.method === 'GET') {
  const user = userFrom(req);
  if (!user || user.role !== 'investor') return json(res, 403, { error: 'Investor access required' });
  const users = readJson('users.json');
  const investor = users.find(u => u.id === user.id);
  const transactions = readJson('transactions.json');
  const cashbackRecords = calculateCashback(user.id, transactions);
  const levelLedger = Array.isArray(investor.levelIncomeLedger) ? investor.levelIncomeLedger : [];
  const targetProgress = getTargetProgress(investor.id, transactions);
  return json(res, 200, {
    cashbackRecords,
    cashbackAvailable: getAvailableCashback(user.id, transactions),
    levelIncomeTotal: getLevelIncomeTotal(investor),
    levelIncomeBalance: getLevelIncomeBalance(investor, transactions),
    levelIncomeLedger: levelLedger,
    levelIncomeNextWithdrawAt: investor.levelIncomeNextWithdrawAt || null,
    targetAchieved: targetProgress.achieved,
    targetDepositTotal: targetProgress.depositTotal,
    targetAmount: targetProgress.targetAmount,
    targetWithdrawn: targetProgress.withdrawn,
    targetRemaining: targetProgress.remaining,
    targetWithdrawals: targetProgress.withdrawals,
    directDownline: directDownline(users, investor.id).map(u => ({
      id: u.id, name: u.name || '', totalInvestment: Number(u.totalInvestment || 0)
    })),
    downlineDetails: buildDownlineIncomeDetails(investor.id, users, levelLedger),
    levelRates: { 1: 10, 2: 10, 3: 7, 4: 5, 5: 3 },
    tierRates: { Normal: null, Silver: 10, Gold: 12 },
    maxLevels: 5,
    maxIdsPerLevel: 5
  });
}

// PAYMENT SCREENSHOT
        // AUTHENTICATED ACCESS
        // =================================================

        if (
          req.url.startsWith(
            '/uploads/'
          ) &&
          req.method === 'GET'
        ) {

          const user =
            userFrom(req);

          // -------------------------------------------------
          // LOGIN REQUIRED
          // -------------------------------------------------

          if (!user) {

            return json(
              res,
              401,
              {
                error:
                  'Login required'
              }
            );
          }

          // -------------------------------------------------
          // GET SAFE FILENAME
          // -------------------------------------------------

          const filename =
            decodeURIComponent(
              req.url
                .split('?')[0]
                .replace(
                  '/uploads/',
                  ''
                )
            );

          const safeFilename =
            path.basename(
              filename
            );

          const filePath =
            path.resolve(
              UPLOADS,
              safeFilename
            );

          const uploadDir =
            path.resolve(
              UPLOADS
            );

          const relative =
            path.relative(
              uploadDir,
              filePath
            );

          // -------------------------------------------------
          // PATH SECURITY
          // -------------------------------------------------

          if (
            relative.startsWith('..') ||
            path.isAbsolute(
              relative
            )
          ) {

            return json(
              res,
              403,
              {
                error:
                  'Forbidden'
              }
            );
          }

          // -------------------------------------------------
          // FILE EXISTS
          // -------------------------------------------------

          if (
            !fs.existsSync(
              filePath
            ) ||
            !fs.statSync(
              filePath
            ).isFile()
          ) {

            return json(
              res,
              404,
              {
                error:
                  'File not found'
              }
            );
          }

          // -------------------------------------------------
          // FIND TRANSACTION
          // -------------------------------------------------

          const transactions =
            readJson(
              'transactions.json'
            );

          const transaction =
            transactions.find(
              x =>
                x.paymentScreenshot ===
                `/uploads/${safeFilename}`
            );

          if (!transaction) {

            return json(
              res,
              404,
              {
                error:
                  'Payment proof not found'
              }
            );
          }

          // -------------------------------------------------
          // ACCESS CONTROL
          // -------------------------------------------------

          if (
            user.role !== 'admin' &&
            transaction.userId !==
              user.id
          ) {

            return json(
              res,
              403,
              {
                error:
                  'Access denied'
              }
            );
          }

          // -------------------------------------------------
          // MIME TYPE
          // -------------------------------------------------

          const ext =
            path.extname(
              filePath
            ).toLowerCase();

          const types = {

            '.jpg':
              'image/jpeg',

            '.jpeg':
              'image/jpeg',

            '.png':
              'image/png',

            '.webp':
              'image/webp'
          };

          // -------------------------------------------------
          // SEND IMAGE
          // -------------------------------------------------

          res.writeHead(
            200,
            {
              'Content-Type':
                types[ext] ||
                'application/octet-stream',

              'Cache-Control':
                'private, no-store'
            }
          );

          return res.end(
            fs.readFileSync(
              filePath
            )
          );
        }


        // =================================================
        // STATIC FILES
        // =================================================

        const requestedUrl =
          req.url.split('?')[0];

        const file =
          requestedUrl === '/'
            ? '/index.html'
            : requestedUrl;

        const safe =
          path
            .normalize(
              file
            )
            .replace(
              /^[/\\]+/,
              ''
            );

        const publicDir =
          path.resolve(
            __dirname,
            'public'
          );

        const fp =
          path.resolve(
            publicDir,
            safe
          );

        const relativePath =
          path.relative(
            publicDir,
            fp
          );

        // -------------------------------------------------
        // STATIC PATH SECURITY
        // -------------------------------------------------

        if (
          relativePath.startsWith('..') ||
          path.isAbsolute(
            relativePath
          )
        ) {

          return json(
            res,
            403,
            {
              error:
                'Forbidden'
            }
          );
        }

        // -------------------------------------------------
        // SERVE STATIC FILE
        // -------------------------------------------------

        if (
          fs.existsSync(fp) &&
          fs.statSync(fp).isFile()
        ) {

          const ext =
            path.extname(
              fp
            ).toLowerCase();

          const types = {

            '.html':
              'text/html; charset=utf-8',

            '.css':
              'text/css; charset=utf-8',

            '.js':
              'text/javascript; charset=utf-8',

            '.json':
              'application/json; charset=utf-8',

            '.svg':
              'image/svg+xml',

            '.png':
              'image/png',

            '.jpg':
              'image/jpeg',

            '.jpeg':
              'image/jpeg',

            '.webp':
              'image/webp'
          };

          res.writeHead(
            200,
            {
              'Content-Type':
                types[ext] ||
                'application/octet-stream'
            }
          );

          return res.end(
            fs.readFileSync(
              fp
            )
          );
        }


        // =================================================
        // NOT FOUND
        // =================================================

        return json(
          res,
          404,
          {
            error:
              'Not found'
          }
        );


               


        // =================================================
        // SERVER ERROR
        // =================================================

      } catch (e) {

        console.error(
          "SERVER ERROR:",
          e
        );

        if (!res.headersSent) {

          return json(
            res,
            500,
            {
              error:
                "Server error"
            }
          );

        }

        res.end();
      }

    }
  );

// =====================================================
// START SERVER
// =====================================================

server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(`SPARTNER portal running at http://0.0.0.0:${PORT}`);

    console.log(
      `Payment uploads directory: ${UPLOADS}`
    );

    console.log(
      "Bank Accounts API: ENABLED"
    );

    console.log(
      "Withdrawal API: ENABLED"
    );

    console.log(
      "Admin Transaction Status API: ENABLED"
    );

  }
);