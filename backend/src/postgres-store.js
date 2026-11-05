import { randomUUID } from 'node:crypto';
import { createOpaqueToken, hashToken, normalizeEmail } from './security.js';
import { DEMO_STRATEGY } from './fixtures.js';
import { evaluateTrade, DIMENSION_ORDER } from './scoring.js';
import { buildTrendSeries } from './analytics.js';

const sampleDate = (days, hour = 10) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

const mapTrade = (row) => ({
  id: row.id,
  identity_id: row.identity_id,
  strategy_id: row.strategy_id,
  strategy_version_id: row.strategy_version_id,
  ...row.payload,
  created_at: row.created_at.toISOString()
});

const mapStrategy = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  status: row.status || 'draft',
  draft_rules: row.rules || [],
  draft_trading_schedule: row.trading_schedule || null,
  markets: row.markets || [],
  timeframes: row.timeframes || [],
  entry_conditions: row.entry_conditions || [],
  stop_loss_method: row.stop_loss_method || {},
  exit_plan: row.exit_plan || {},
  risk_rules: row.risk_rules || [],
  position_sizing_rules: row.position_sizing_rules || [],
  other_restrictions: row.other_restrictions || [],
  preferences: row.preferences || [],
  current_version_id: row.current_version_id || null,
  version_number: row.version_number || 0,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at?.toISOString() || row.created_at.toISOString()
});

export class PostgresStore {
  constructor(pool, { sessionTtlHours = 24 } = {}) {
    this.pool = pool;
    this.sessionTtlHours = sessionTtlHours;
  }

  async createDemoSession(displayName = 'Demo Trader') {
    const identityId = randomUUID();
    const token = createOpaqueToken();
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3600_000).toISOString();

    const strategy = {
      ...structuredClone(DEMO_STRATEGY),
      id: strategyId,
      current_version_id: versionId,
      status: 'confirmed',
      version_number: 1
    };

    const snapshot = {
      name: strategy.name,
      description: strategy.description,
      rules: structuredClone(strategy.draft_rules),
      trading_schedule: structuredClone(strategy.draft_trading_schedule),
      markets: structuredClone(strategy.markets),
      timeframes: structuredClone(strategy.timeframes),
      entry_conditions: structuredClone(strategy.entry_conditions),
      stop_loss_method: structuredClone(strategy.stop_loss_method),
      exit_plan: structuredClone(strategy.exit_plan),
      risk_rules: structuredClone(strategy.risk_rules),
      position_sizing_rules: structuredClone(strategy.position_sizing_rules),
      other_restrictions: structuredClone(strategy.other_restrictions),
      preferences: structuredClone(strategy.preferences)
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO identities(id, mode, display_name) VALUES($1, $2, $3)', [identityId, 'demo', displayName]);
      await client.query('INSERT INTO sessions(token_hash, identity_id, expires_at) VALUES($1, $2, $3)', [hashToken(token), identityId, expiresAt]);
      await client.query(
        `INSERT INTO strategies(id, identity_id, name, rules, trading_schedule, current_version_id, status, description,
                               markets, timeframes, entry_conditions, stop_loss_method, exit_plan, risk_rules, position_sizing_rules, other_restrictions, preferences)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          strategy.id, identityId, strategy.name, JSON.stringify(strategy.draft_rules), JSON.stringify(strategy.draft_trading_schedule),
          strategy.current_version_id, 'confirmed', strategy.description,
          JSON.stringify(strategy.markets), JSON.stringify(strategy.timeframes), JSON.stringify(strategy.entry_conditions),
          JSON.stringify(strategy.stop_loss_method), JSON.stringify(strategy.exit_plan), JSON.stringify(strategy.risk_rules),
          JSON.stringify(strategy.position_sizing_rules), JSON.stringify(strategy.other_restrictions), JSON.stringify(strategy.preferences)
        ]
      );
      await client.query(
        `INSERT INTO strategy_versions(id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, confirmed_at, snapshot)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [versionId, strategy.id, identityId, 1, strategy.name, JSON.stringify(strategy.draft_rules), JSON.stringify(strategy.draft_trading_schedule), 'Initial confirmed demo version', now, JSON.stringify(snapshot)]
      );
      for (const payload of this.samplePayloads()) {
        const tradeId = randomUUID();
        const trade = { id: tradeId, identity_id: identityId, strategy_id: strategy.id, strategy_version_id: strategy.current_version_id, ...payload };
        await client.query('INSERT INTO trades(id, identity_id, strategy_id, strategy_version_id, payload, created_at) VALUES($1, $2, $3, $4, $5, $6)', [tradeId, identityId, strategy.id, strategy.current_version_id, JSON.stringify(payload), payload.opened_at]);
        const result = evaluateTrade(trade, strategy);
        await client.query('INSERT INTO reviews(id, trade_id, result, created_at) VALUES($1, $2, $3, $4)', [randomUUID(), tradeId, JSON.stringify(result), payload.closed_at]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { token, token_type: 'Bearer', expires_at: expiresAt, identity: { id: identityId, mode: 'demo', display_name: displayName }, demo_data: { strategy_id: strategy.id, strategy_version_id: strategy.current_version_id, trade_count: 3, review_count: 3 } };
  }

  samplePayloads() {
    return [
      { symbol: 'BTC/USDT', direction: 'long', quantity: 0.5, entry_price: 63000, exit_price: 65000, realized_pnl: 1000, risk_amount: 80, opened_at: sampleDate(2, 10), closed_at: sampleDate(2, 14), evidence: [{ kind: 'note', payload: { setup_note: 'Breakout above weekly resistance with volume confirmation.' } }, { kind: 'state', payload: { emotional_state: 'calm' } }] },
      { symbol: 'ETH/USDT', direction: 'short', quantity: 2, entry_price: 3500, exit_price: 3550, realized_pnl: -100, risk_amount: 120, opened_at: sampleDate(1, 11), closed_at: sampleDate(1, 12), evidence: [{ kind: 'note', payload: { setup_note: 'Failed retest at the range high.' } }, { kind: 'state', payload: { emotional_state: 'anxious' } }] },
      { symbol: 'SOL/USDT', direction: 'long', quantity: 10, entry_price: 150, exit_price: 154.5, realized_pnl: 45, risk_amount: 60, opened_at: sampleDate(3, 9), closed_at: sampleDate(3, 11), evidence: [{ kind: 'note', payload: { setup_note: 'Higher-low continuation setup.' } }, { kind: 'state', payload: { emotional_state: 'calm' } }] }
    ];
  }

  async authenticate(token) {
    const { rows } = await this.pool.query('SELECT i.id,i.mode,i.display_name,u.email,u.email_verified_at FROM sessions s JOIN identities i ON i.id=s.identity_id LEFT JOIN users u ON u.id=i.user_id WHERE s.token_hash=$1 AND s.expires_at > now()', [hashToken(token)]);
    if (!rows[0]) return null;
    return { ...rows[0], email_verified_at: rows[0].email_verified_at?.toISOString() || null };
  }

  async registerUser({ email, passwordHash, displayName, verificationTokenHash, verificationExpiresAt }) {
    const userId = randomUUID();
    const identityId = randomUUID();
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const strategy = { ...structuredClone(DEMO_STRATEGY), id: strategyId, name: 'Starter Strategy', current_version_id: versionId };
    const snapshot = {
      name: strategy.name,
      description: strategy.description,
      rules: structuredClone(strategy.draft_rules),
      trading_schedule: structuredClone(strategy.draft_trading_schedule),
      markets: structuredClone(strategy.markets),
      timeframes: structuredClone(strategy.timeframes),
      entry_conditions: structuredClone(strategy.entry_conditions),
      stop_loss_method: structuredClone(strategy.stop_loss_method),
      exit_plan: structuredClone(strategy.exit_plan),
      risk_rules: structuredClone(strategy.risk_rules),
      position_sizing_rules: structuredClone(strategy.position_sizing_rules),
      other_restrictions: structuredClone(strategy.other_restrictions),
      preferences: structuredClone(strategy.preferences)
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [userId, normalizeEmail(email), passwordHash]);
      await client.query('INSERT INTO identities(id,mode,user_id,display_name) VALUES($1,\'user\',$2,$3)', [identityId, userId, displayName]);
      await client.query(
        `INSERT INTO strategies(id,identity_id,name,rules,trading_schedule,current_version_id,status,description,
                               markets, timeframes, entry_conditions, stop_loss_method, exit_plan, risk_rules, position_sizing_rules, other_restrictions, preferences)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          strategy.id, identityId, strategy.name, JSON.stringify(strategy.draft_rules), JSON.stringify(strategy.draft_trading_schedule),
          strategy.current_version_id, 'confirmed', 'Starter strategy for disciplined execution',
          JSON.stringify(strategy.markets), JSON.stringify(strategy.timeframes), JSON.stringify(strategy.entry_conditions),
          JSON.stringify(strategy.stop_loss_method), JSON.stringify(strategy.exit_plan), JSON.stringify(strategy.risk_rules),
          JSON.stringify(strategy.position_sizing_rules), JSON.stringify(strategy.other_restrictions), JSON.stringify(strategy.preferences)
        ]
      );
      await client.query(
        `INSERT INTO strategy_versions(id,strategy_id,identity_id,version_number,name,rules,trading_schedule,change_summary,confirmed_at,snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [versionId, strategy.id, identityId, 1, strategy.name, JSON.stringify(strategy.draft_rules), JSON.stringify(strategy.draft_trading_schedule), 'Initial confirmed starter strategy', new Date().toISOString(), JSON.stringify(snapshot)]
      );
      await client.query('INSERT INTO email_verification_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [verificationTokenHash, userId, verificationExpiresAt]);
      await client.query('COMMIT');
      return { id: identityId, mode: 'user', display_name: displayName, email: normalizeEmail(email), email_verified_at: null };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return null;
      throw error;
    } finally {
      client.release();
    }
  }

  async createVerificationTokenForEmail(email, tokenHash, expiresAt) {
    const { rows } = await this.pool.query('INSERT INTO email_verification_tokens(token_hash,user_id,expires_at) SELECT $2,id,$3 FROM users WHERE email=$1 AND email_verified_at IS NULL RETURNING user_id', [normalizeEmail(email), tokenHash, expiresAt]);
    return rows[0]?.user_id || null;
  }

  async verifyEmailToken(tokenHash) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const token = await client.query('SELECT user_id FROM email_verification_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE', [tokenHash]);
      if (!token.rows[0]) { await client.query('ROLLBACK'); return null; }
      const userId = token.rows[0].user_id;
      await client.query('UPDATE email_verification_tokens SET consumed_at=now() WHERE token_hash=$1', [tokenHash]);
      await client.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [userId]);
      const identity = await client.query('SELECT i.id,i.mode,i.display_name,u.email,u.email_verified_at FROM identities i JOIN users u ON u.id=i.user_id WHERE u.id=$1', [userId]);
      await client.query('COMMIT');
      const row = identity.rows[0];
      return row ? { ...row, email_verified_at: row.email_verified_at?.toISOString() || null } : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserByEmail(email) {
    const { rows } = await this.pool.query('SELECT i.id,i.mode,i.display_name,u.email,u.email_verified_at,u.password_hash FROM users u JOIN identities i ON i.user_id=u.id WHERE u.email=$1', [normalizeEmail(email)]);
    if (!rows[0]) return null;
    return { ...rows[0], email_verified_at: rows[0].email_verified_at?.toISOString() || null };
  }

  async createUserSession(identityId, sessionTtlHours = this.sessionTtlHours) {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + sessionTtlHours * 3600_000).toISOString();
    await this.pool.query('INSERT INTO sessions(token_hash,identity_id,expires_at) VALUES($1,$2,$3)', [hashToken(token), identityId, expiresAt]);
    const { rows } = await this.pool.query('SELECT i.id,i.mode,i.display_name,u.email,u.email_verified_at FROM identities i JOIN users u ON u.id=i.user_id WHERE i.id=$1', [identityId]);
    const row = rows[0];
    return { token, token_type: 'Bearer', expires_at: expiresAt, identity: { ...row, email_verified_at: row.email_verified_at?.toISOString() || null } };
  }

  async revokeSession(token) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  }

  async connectRoqqu(identityId) {
    const { rows } = await this.pool.query("INSERT INTO roqqu_connections(identity_id,account_email) SELECT i.id,u.email FROM identities i JOIN users u ON u.id=i.user_id WHERE i.id=$1 AND i.mode='user' AND u.email_verified_at IS NOT NULL ON CONFLICT(identity_id) DO UPDATE SET account_email=EXCLUDED.account_email,connected_at=now() RETURNING identity_id,account_email,connected_at", [identityId]);
    return rows[0] ? { identity_id: rows[0].identity_id, account_email: rows[0].account_email, connected_at: rows[0].connected_at.toISOString() } : null;
  }

  async getRoqquConnection(identityId) {
    const { rows } = await this.pool.query('SELECT identity_id,account_email,connected_at FROM roqqu_connections WHERE identity_id=$1', [identityId]);
    return rows[0] ? { identity_id: rows[0].identity_id, account_email: rows[0].account_email, connected_at: rows[0].connected_at.toISOString() } : null;
  }

  async disconnectRoqqu(identityId) {
    await this.pool.query('DELETE FROM roqqu_connections WHERE identity_id=$1', [identityId]);
  }

  async getStrategies(identityId) {
    const { rows } = await this.pool.query(
      `SELECT s.*, sv.version_number
       FROM strategies s
       LEFT JOIN strategy_versions sv ON sv.id = s.current_version_id
       WHERE s.identity_id = $1
       ORDER BY s.created_at`,
      [identityId]
    );
    return {
      strategies: rows.map(mapStrategy)
    };
  }

  async getStrategy(identityId, strategyId) {
    const { rows } = await this.pool.query(
      `SELECT s.*, sv.version_number
       FROM strategies s
       LEFT JOIN strategy_versions sv ON sv.id = s.current_version_id
       WHERE s.id = $1 AND s.identity_id = $2`,
      [strategyId, identityId]
    );
    if (!rows[0]) return null;
    return mapStrategy(rows[0]);
  }

  async createStrategy(identityId, {
    name,
    description = '',
    status = 'confirmed',
    draft_rules = [],
    draft_trading_schedule = null,
    markets = [],
    timeframes = [],
    entry_conditions = [],
    stop_loss_method = {},
    exit_plan = {},
    risk_rules = [],
    position_sizing_rules = [],
    other_restrictions = [],
    preferences = []
  }) {
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const normalizedStatus = ['draft', 'needs_review', 'confirmed', 'archived'].includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : 'draft';

    const resolvedRiskRules = Array.isArray(risk_rules) && risk_rules.length > 0
      ? risk_rules
      : (Array.isArray(draft_rules) ? draft_rules.filter((r) => r.dimension === 'risk') : []);
    const resolvedSizingRules = Array.isArray(position_sizing_rules) && position_sizing_rules.length > 0
      ? position_sizing_rules
      : (Array.isArray(draft_rules) ? draft_rules.filter((r) => r.dimension === 'sizing') : []);

    const snapshot = {
      name: name.trim(),
      description: (description || '').trim(),
      rules: draft_rules,
      trading_schedule: draft_trading_schedule,
      markets,
      timeframes,
      entry_conditions,
      stop_loss_method,
      exit_plan,
      risk_rules: resolvedRiskRules,
      position_sizing_rules: resolvedSizingRules,
      other_restrictions,
      preferences
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO strategies(id, identity_id, name, rules, trading_schedule, current_version_id, status, description,
                               markets, timeframes, entry_conditions, stop_loss_method, exit_plan, risk_rules, position_sizing_rules, other_restrictions, preferences)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          strategyId, identityId, name.trim(), JSON.stringify(draft_rules), JSON.stringify(draft_trading_schedule),
          normalizedStatus === 'confirmed' ? versionId : null, normalizedStatus, (description || '').trim(),
          JSON.stringify(markets), JSON.stringify(timeframes), JSON.stringify(entry_conditions),
          JSON.stringify(stop_loss_method), JSON.stringify(exit_plan), JSON.stringify(resolvedRiskRules),
          JSON.stringify(resolvedSizingRules), JSON.stringify(other_restrictions), JSON.stringify(preferences)
        ]
      );

      if (normalizedStatus === 'confirmed') {
        await client.query(
          `INSERT INTO strategy_versions(id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, snapshot)
           VALUES($1, $2, $3, 1, $4, $5, $6, 'Initial confirmed strategy version', $7)`,
          [versionId, strategyId, identityId, name.trim(), JSON.stringify(draft_rules), JSON.stringify(draft_trading_schedule), JSON.stringify(snapshot)]
        );
      }

      await client.query('COMMIT');
      return mapStrategy({ ...rows[0], version_number: normalizedStatus === 'confirmed' ? 1 : 0 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateStrategyDraft(identityId, strategyId, updates) {
    const existing = await this.getStrategy(identityId, strategyId);
    if (!existing) return null;
    if (existing.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot edit an archived strategy.');
    }

    const newName = typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : existing.name;
    const newDesc = typeof updates.description === 'string' ? updates.description.trim() : existing.description;
    const newRules = Array.isArray(updates.draft_rules) ? updates.draft_rules : existing.draft_rules;
    const newSchedule = updates.draft_trading_schedule !== undefined ? updates.draft_trading_schedule : existing.draft_trading_schedule;
    const newMarkets = Array.isArray(updates.markets) ? updates.markets : existing.markets;
    const newTimeframes = Array.isArray(updates.timeframes) ? updates.timeframes : existing.timeframes;
    const newEntries = Array.isArray(updates.entry_conditions) ? updates.entry_conditions : existing.entry_conditions;
    const newStopLoss = updates.stop_loss_method !== undefined ? updates.stop_loss_method : existing.stop_loss_method;
    const newExitPlan = updates.exit_plan !== undefined ? updates.exit_plan : existing.exit_plan;
    const newRiskRules = Array.isArray(updates.risk_rules) ? updates.risk_rules : existing.risk_rules;
    const newSizingRules = Array.isArray(updates.position_sizing_rules) ? updates.position_sizing_rules : existing.position_sizing_rules;
    const newRestrictions = Array.isArray(updates.other_restrictions) ? updates.other_restrictions : existing.other_restrictions;
    const newPreferences = Array.isArray(updates.preferences) ? updates.preferences : existing.preferences;

    const { rows } = await this.pool.query(
      `UPDATE strategies 
       SET name = $1, description = $2, rules = $3, trading_schedule = $4, status = 'draft', updated_at = now(),
           markets = $7, timeframes = $8, entry_conditions = $9, stop_loss_method = $10, exit_plan = $11,
           risk_rules = $12, position_sizing_rules = $13, other_restrictions = $14, preferences = $15
       WHERE id = $5 AND identity_id = $6
       RETURNING *`,
      [
        newName, newDesc, JSON.stringify(newRules), JSON.stringify(newSchedule), strategyId, identityId,
        JSON.stringify(newMarkets), JSON.stringify(newTimeframes), JSON.stringify(newEntries),
        JSON.stringify(newStopLoss), JSON.stringify(newExitPlan), JSON.stringify(newRiskRules),
        JSON.stringify(newSizingRules), JSON.stringify(newRestrictions), JSON.stringify(newPreferences)
      ]
    );
    if (!rows[0]) return null;
    return mapStrategy(rows[0]);
  }

  async submitStrategyForReview(identityId, strategyId) {
    const existing = await this.getStrategy(identityId, strategyId);
    if (!existing) return null;
    if (existing.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot submit an archived strategy for review.');
    }
    const { rows } = await this.pool.query(
      `UPDATE strategies SET status = 'needs_review', updated_at = now() WHERE id = $1 AND identity_id = $2 RETURNING *`,
      [strategyId, identityId]
    );
    return rows[0] ? mapStrategy(rows[0]) : null;
  }

  async confirmStrategyVersion(identityId, strategyId, { change_summary = 'Confirmed strategy update' } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stratRes = await client.query('SELECT * FROM strategies WHERE id = $1 AND identity_id = $2 FOR UPDATE', [strategyId, identityId]);
      if (!stratRes.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const s = stratRes.rows[0];
      if (s.status === 'archived') {
        await client.query('ROLLBACK');
        throw new Error('INVALID_LIFECYCLE_TRANSITION: Cannot confirm an archived strategy.');
      }

      const maxRes = await client.query('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM strategy_versions WHERE strategy_id = $1', [strategyId]);
      const nextVersionNumber = Number(maxRes.rows[0].max_v) + 1;
      const newVersionId = randomUUID();
      const now = new Date().toISOString();

      const snapshot = {
        name: s.name,
        description: s.description || '',
        rules: s.rules,
        trading_schedule: s.trading_schedule,
        markets: s.markets || [],
        timeframes: s.timeframes || [],
        entry_conditions: s.entry_conditions || [],
        stop_loss_method: s.stop_loss_method || {},
        exit_plan: s.exit_plan || {},
        risk_rules: s.risk_rules || [],
        position_sizing_rules: s.position_sizing_rules || [],
        other_restrictions: s.other_restrictions || [],
        preferences: s.preferences || []
      };

      await client.query(
        `INSERT INTO strategy_versions(id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, confirmed_at, snapshot)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [newVersionId, strategyId, identityId, nextVersionNumber, s.name, s.rules, s.trading_schedule, change_summary || `Version ${nextVersionNumber} confirmed`, now, JSON.stringify(snapshot)]
      );
      const updateRes = await client.query(
        `UPDATE strategies 
         SET current_version_id = $1, status = 'confirmed', updated_at = now()
         WHERE id = $2 AND identity_id = $3
         RETURNING *`,
        [newVersionId, strategyId, identityId]
      );
      await client.query('COMMIT');
      const version = {
        id: newVersionId,
        strategy_id: strategyId,
        identity_id: identityId,
        version_number: nextVersionNumber,
        name: s.name,
        rules: s.rules,
        trading_schedule: s.trading_schedule,
        snapshot,
        change_summary: change_summary || `Version ${nextVersionNumber} confirmed`,
        confirmed_at: now
      };
      return { strategy: mapStrategy({ ...updateRes.rows[0], version_number: nextVersionNumber }), version };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async archiveStrategy(identityId, strategyId) {
    const existing = await this.getStrategy(identityId, strategyId);
    if (!existing) return null;
    if (existing.status === 'archived') {
      throw new Error('INVALID_LIFECYCLE_TRANSITION: Strategy is already archived.');
    }
    const { rows } = await this.pool.query(
      `UPDATE strategies SET status = 'archived', updated_at = now() WHERE id = $1 AND identity_id = $2 RETURNING *`,
      [strategyId, identityId]
    );
    return rows[0] ? mapStrategy(rows[0]) : null;
  }

  async getStrategyVersions(identityId, strategyId) {
    const existing = await this.getStrategy(identityId, strategyId);
    if (!existing) return null;
    const { rows } = await this.pool.query(
      `SELECT id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, confirmed_at, snapshot
       FROM strategy_versions
       WHERE strategy_id = $1 AND identity_id = $2
       ORDER BY version_number DESC`,
      [strategyId, identityId]
    );
    return {
      versions: rows.map((r) => ({
        id: r.id,
        strategy_id: r.strategy_id,
        identity_id: r.identity_id,
        version_number: r.version_number,
        name: r.name,
        rules: r.rules,
        trading_schedule: r.trading_schedule,
        snapshot: r.snapshot,
        change_summary: r.change_summary,
        confirmed_at: r.confirmed_at.toISOString()
      }))
    };
  }

  async getStrategyVersion(identityId, strategyId, versionId) {
    const { rows } = await this.pool.query(
      `SELECT id, strategy_id, identity_id, version_number, name, rules, trading_schedule, change_summary, confirmed_at, snapshot
       FROM strategy_versions
       WHERE id = $1 AND strategy_id = $2 AND identity_id = $3`,
      [versionId, strategyId, identityId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      strategy_id: r.strategy_id,
      identity_id: r.identity_id,
      version_number: r.version_number,
      name: r.name,
      rules: r.rules,
      trading_schedule: r.trading_schedule,
      snapshot: r.snapshot,
      change_summary: r.change_summary,
      confirmed_at: r.confirmed_at.toISOString()
    };
  }

  async createTrade(identityId, payload) {
    if (!payload.strategy_id) {
      throw new Error('STRATEGY_REQUIRED: A valid strategy_id is required.');
    }
    const strategy = await this.getStrategy(identityId, payload.strategy_id);
    if (!strategy) throw new Error('STRATEGY_NOT_FOUND');

    let strategyVersionId;
    if (payload.strategy_version_id) {
      const v = await this.getStrategyVersion(identityId, strategy.id, payload.strategy_version_id);
      if (!v) throw new Error('VERSION_NOT_FOUND: Specified strategy version does not exist.');
      strategyVersionId = v.id;
    } else {
      if (!strategy.current_version_id) {
        throw new Error('STRATEGY_NOT_CONFIRMED: Strategy must have a confirmed version before recording trades.');
      }
      strategyVersionId = strategy.current_version_id;
    }

    const id = randomUUID();
    const cleanPayload = { ...payload };
    delete cleanPayload.strategy_id;
    delete cleanPayload.strategy_version_id;
    const { rows } = await this.pool.query(
      'INSERT INTO trades(id,identity_id,strategy_id,strategy_version_id,payload) VALUES($1,$2,$3,$4,$5) RETURNING created_at',
      [id, identityId, strategy.id, strategyVersionId, JSON.stringify(cleanPayload)]
    );
    return { id, identity_id: identityId, strategy_id: strategy.id, strategy_version_id: strategyVersionId, ...cleanPayload, created_at: rows[0].created_at.toISOString() };
  }

  async listTrades(identityId) {
    const { rows } = await this.pool.query('SELECT t.*, r.id AS review_id, r.result AS review_result FROM trades t LEFT JOIN reviews r ON r.trade_id=t.id WHERE t.identity_id=$1 ORDER BY t.created_at DESC', [identityId]);
    const trades = rows.map((row) => ({ ...mapTrade(row), review: row.review_id ? { id: row.review_id, result: row.review_result } : null }));
    return { trades, total: trades.length };
  }

  async getTrade(identityId, tradeId) {
    const { rows } = await this.pool.query('SELECT * FROM trades WHERE id=$1 AND identity_id=$2', [tradeId, identityId]);
    return rows[0] ? mapTrade(rows[0]) : null;
  }

  async getReview(identityId, tradeId) {
    const { rows } = await this.pool.query('SELECT r.* FROM reviews r JOIN trades t ON t.id=r.trade_id WHERE t.id=$1 AND t.identity_id=$2', [tradeId, identityId]);
    return rows[0] ? { id: rows[0].id, trade_id: tradeId, result: rows[0].result, created_at: rows[0].created_at.toISOString() } : null;
  }

  async saveReview(identityId, tradeId, result) {
    const { rows } = await this.pool.query('INSERT INTO reviews(id,trade_id,result) SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM trades WHERE id=$2 AND identity_id=$4) ON CONFLICT(trade_id) DO UPDATE SET result=EXCLUDED.result RETURNING id,trade_id,result,created_at', [randomUUID(), tradeId, JSON.stringify(result), identityId]);
    return rows[0] ? { id: rows[0].id, trade_id: rows[0].trade_id, result: rows[0].result, created_at: rows[0].created_at.toISOString() } : null;
  }

  async getStats(identityId, currency = 'USD') {
    const { rows } = await this.pool.query('SELECT id,payload,created_at FROM trades WHERE identity_id=$1 ORDER BY created_at', [identityId]);
    const closed = rows.map((row) => ({ id: row.id, ...row.payload })).filter((trade) => trade.closed_at && Number.isFinite(Number(trade.realized_pnl)));
    const values = closed.map((trade) => Number(trade.realized_pnl));
    if (!values.length) return { currency, sample_size: 0, wins: 0, losses: 0, win_rate: null, net_realized_pnl: 0, profit_factor: null, expectancy: null, cumulative_realized_pnl_curve: [] };
    const wins = values.filter((value) => value > 0).length;
    const losses = values.filter((value) => value < 0).length;
    const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const negative = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    let cumulative = 0;
    const curve = closed.sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at)).map((trade) => ({ trade_id: trade.id, closed_at: trade.closed_at, cumulative_realized_pnl: (cumulative += Number(trade.realized_pnl)) }));
    return { currency, sample_size: values.length, wins, losses, win_rate: wins / values.length * 100, net_realized_pnl: values.reduce((sum, value) => sum + value, 0), profit_factor: negative ? positive / negative : null, expectancy: values.reduce((sum, value) => sum + value, 0) / values.length, cumulative_realized_pnl_curve: curve };
  }

  async getProgress(identityId) {
    const { rows } = await this.pool.query('SELECT t.id AS trade_id,t.strategy_version_id,t.payload,t.created_at AS trade_created_at,r.id AS review_id,r.result,r.created_at AS review_created_at FROM trades t JOIN reviews r ON r.trade_id=t.id WHERE t.identity_id=$1', [identityId]);
    const groups = new Map();
    for (const row of rows) {
      const group = groups.get(row.strategy_version_id) || { results: [], trades: [], reviews: [] };
      group.results.push(row.result);
      group.trades.push({ id: row.trade_id, ...row.payload, created_at: row.trade_created_at.toISOString() });
      group.reviews.push({ id: row.review_id, trade_id: row.trade_id, result: row.result, created_at: row.review_created_at.toISOString() });
      groups.set(row.strategy_version_id, group);
    }
    const versions = [...groups].map(([versionId, group]) => {
      const { results } = group;
      const scores = results.map((result) => result.decision_quality_score).filter((score) => score !== null);
      const coverage = results.map((result) => result.coverage_pct);
      const counts = Object.fromEntries(DIMENSION_ORDER.map((dimension) => [dimension, { followed: 0, broken: 0, cannot_assess: 0 }]));
      for (const result of results) for (const dimension of result.dimensions) counts[dimension.dimension][dimension.status] += 1;
      return { strategy_version_id: versionId, assessed_trades: results.length, average_decision_quality_score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null, average_coverage_pct: coverage.reduce((sum, value) => sum + value, 0) / coverage.length, trend: { eligible: results.length >= 5, series: results.length >= 5 ? buildTrendSeries(group.trades, group.reviews) : [] }, dimension_counts: counts };
    });
    return { progress: { versions } };
  }

  async getIdentity(identityId) {
    const { rows } = await this.pool.query('SELECT id, mode, display_name FROM identities WHERE id = $1', [identityId]);
    return rows[0] ? { ...rows[0] } : null;
  }

  async createConversation(identityId, { title = 'Discipline Coaching', context_type = 'general', context_id = null, strategy_id = null } = {}) {
    if (strategy_id) {
      const strat = await this.getStrategy(identityId, strategy_id);
      if (!strat) throw new Error('STRATEGY_NOT_FOUND');
    }
    const id = randomUUID();
    const safeType = ['general', 'trade_review', 'strategy_refinement', 'weekly_coaching'].includes(context_type) ? context_type : 'general';
    const { rows } = await this.pool.query(
      `INSERT INTO ai_conversations(id, identity_id, title, context_type, context_id, strategy_id)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING id, identity_id, title, context_type, context_id, strategy_id, status, created_at, updated_at`,
      [id, identityId, (title || 'Discipline Coaching').slice(0, 100), safeType, context_id || null, strategy_id || null]
    );
    const r = rows[0];
    return {
      id: r.id,
      identity_id: r.identity_id,
      strategy_id: r.strategy_id,
      title: r.title,
      status: r.status,
      context_type: r.context_type,
      context_id: r.context_id,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString()
    };
  }

  async getConversation(identityId, conversationId) {
    const { rows } = await this.pool.query(
      `SELECT id, identity_id, title, context_type, context_id, strategy_id, status, created_at, updated_at
       FROM ai_conversations
       WHERE id = $1 AND identity_id = $2`,
      [conversationId, identityId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      identity_id: r.identity_id,
      strategy_id: r.strategy_id,
      title: r.title,
      status: r.status,
      context_type: r.context_type,
      context_id: r.context_id,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString()
    };
  }

  async listConversations(identityId, { limit = 20 } = {}) {
    const { rows } = await this.pool.query(
      `SELECT id, identity_id, title, context_type, context_id, strategy_id, status, created_at, updated_at
       FROM ai_conversations
       WHERE identity_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [identityId, Math.min(Math.max(1, limit), 100)]
    );
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        identity_id: r.identity_id,
        strategy_id: r.strategy_id,
        title: r.title,
        status: r.status,
        context_type: r.context_type,
        context_id: r.context_id,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString()
      }))
    };
  }

  async createMessage(identityId, conversationId, { role, content, metadata = {} }) {
    if (!['user', 'assistant', 'system'].includes(role)) throw new Error('INVALID_MESSAGE_ROLE');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const convoRes = await client.query('SELECT id FROM ai_conversations WHERE id = $1 AND identity_id = $2 FOR UPDATE', [conversationId, identityId]);
      if (!convoRes.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const messageId = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO ai_messages(id, conversation_id, identity_id, role, content, metadata)
         VALUES($1, $2, $3, $4, $5, $6)
         RETURNING id, conversation_id, identity_id, role, content, metadata, created_at`,
        [messageId, conversationId, identityId, role, typeof content === 'string' ? content : '', JSON.stringify(metadata || {})]
      );
      await client.query('UPDATE ai_conversations SET updated_at = now() WHERE id = $1', [conversationId]);
      await client.query('COMMIT');
      const r = rows[0];
      return {
        id: r.id,
        conversation_id: r.conversation_id,
        identity_id: r.identity_id,
        role: r.role,
        content: r.content,
        metadata: r.metadata,
        created_at: r.created_at.toISOString()
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getConversationMessages(identityId, conversationId, { limit = 50 } = {}) {
    const convo = await this.getConversation(identityId, conversationId);
    if (!convo) return null;
    const { rows } = await this.pool.query(
      `SELECT id, conversation_id, identity_id, role, content, metadata, created_at
       FROM ai_messages
       WHERE conversation_id = $1 AND identity_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [conversationId, identityId, Math.min(Math.max(1, limit), 200)]
    );
    return {
      messages: rows.map((r) => ({
        id: r.id,
        conversation_id: r.conversation_id,
        identity_id: r.identity_id,
        role: r.role,
        content: r.content,
        metadata: r.metadata,
        created_at: r.created_at.toISOString()
      }))
    };
  }
}
