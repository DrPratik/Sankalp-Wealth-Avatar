/**
 * Sankalp — Nudges Route
 * GET /api/nudges/:userId — trigger detection + database-cached generation
 * POST /api/nudges/:nudgeId/dismiss — mark nudge as dismissed
 */
const express = require('express');
const router = express.Router();
const triggerDetector = require('../services/triggerDetector');
const complianceGuard = require('../services/complianceGuard');
const geminiClient = require('../services/geminiClient');

router.get('/nudges/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = req.app.locals.db;
    const apiUsage = req.app.locals.apiUsage;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Run trigger detection (plain JS code)
    const activeTriggers = triggerDetector.detectTriggers(userId, db);
    console.log(`[Nudges] Triggers detected: ${activeTriggers.map(t => t.trigger_type).join(', ') || 'none'}`);

    if (activeTriggers.length === 0) {
      // If no triggers are active, auto-dismiss any outstanding nudges in the log
      db.prepare('UPDATE nudges_log SET shown = 1 WHERE user_id = ? AND shown = 0').run(userId);
      return res.json({ nudges: [], triggersDetected: 0 });
    }

    const finalNudges = [];
    const triggersToGenerate = [];

    // 2. Query cache: check if we already have generated, un-dismissed nudges for these active triggers
    for (const trigger of activeTriggers) {
      const cached = db.prepare(
        'SELECT * FROM nudges_log WHERE user_id = ? AND trigger_type = ? AND shown = 0 ORDER BY id DESC LIMIT 1'
      ).get(userId, trigger.trigger_type);

      if (cached) {
        try {
          // Attempt to parse cached JSON
          const nudgeObj = JSON.parse(cached.generated_text);
          nudgeObj.id = cached.id; // Use database ID for dismissal
          finalNudges.push(nudgeObj);
          console.log(`[Nudges Cache] Restored cached nudge for: ${trigger.trigger_type}`);
        } catch (parseErr) {
          // Fallback if parsing fails (legacy string formats)
          const parts = cached.generated_text.split(': ');
          finalNudges.push({
            id: cached.id,
            trigger_type: cached.trigger_type,
            headline: parts[0] || 'Financial Update',
            body: parts.slice(1).join(': ') || cached.generated_text,
            cta_label: 'View',
            compliance_note: null
          });
        }
      } else {
        triggersToGenerate.push(trigger);
      }
    }

    // 3. If there are triggers that need new text, call Gemini
    if (triggersToGenerate.length > 0) {
      console.log(`[Nudges] Generating fresh text for: ${triggersToGenerate.map(t => t.trigger_type).join(', ')}`);
      
      const complianceText = complianceGuard.generateComplianceConstraints(user, {}, db);
      const generated = await geminiClient.generateNudges(triggersToGenerate, user, complianceText, apiUsage);

      // 4. Validate and store each new nudge
      generated.forEach((n, i) => {
        const triggerType = n.trigger_type || triggersToGenerate[i]?.trigger_type || 'general';
        
        if (complianceGuard.validateNudge(n, user)) {
          const nudgeToSave = {
            trigger_type: triggerType,
            headline: n.headline || 'Financial Update',
            body: n.body || 'Check your portfolio for updates.',
            cta_label: n.cta_label || 'View',
            compliance_note: n.compliance_note || null
          };

          // Save JSON string in generated_text
          const insertResult = db.prepare(
            'INSERT INTO nudges_log (user_id, trigger_type, generated_text, shown) VALUES (?, ?, ?, ?)'
          ).run(userId, triggerType, JSON.stringify(nudgeToSave), 0);

          nudgeToSave.id = insertResult.lastInsertRowid;
          finalNudges.push(nudgeToSave);
        } else {
          console.warn(`[Nudges compliance] Blocked generated nudge: ${triggerType}`);
        }
      });
    }

    // Sort final nudges to maintain consistent trigger order
    const triggerOrder = activeTriggers.map(t => t.trigger_type);
    finalNudges.sort((a, b) => triggerOrder.indexOf(a.trigger_type) - triggerOrder.indexOf(b.trigger_type));

    res.json({ nudges: finalNudges, triggersDetected: activeTriggers.length });

  } catch (err) {
    console.error('[Nudges] Error:', err);
    res.status(500).json({ nudges: [], error: 'Failed to retrieve nudges' });
  }
});

router.post('/nudges/:nudgeId/dismiss', (req, res) => {
  try {
    const nudgeId = parseInt(req.params.nudgeId);
    const db = req.app.locals.db;

    const result = db.prepare('UPDATE nudges_log SET shown = 1 WHERE id = ?').run(nudgeId);
    console.log(`[Nudges] Dismissed nudge ID ${nudgeId}. Rows modified: ${result.changes}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Nudges] Dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
});

module.exports = router;
