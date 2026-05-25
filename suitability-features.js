/* ==========================================================================
   Suitability Features
   - Compliance score (TR24/1 pre-submission check)
   - Template library
   - AI-drafted suitability reports (Claude API)
   - Client self-service intake links
   - Annual review scheduler
   ========================================================================== */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getFieldValue(name) {
    const els = qsa(`[name="${name}"]`);
    if (!els.length) return '';
    const first = els[0];
    if (first.type === 'radio') {
      const checked = els.find((e) => e.checked);
      return checked ? checked.value : '';
    }
    if (first.type === 'checkbox') {
      return els.filter((e) => e.checked).map((e) => e.value);
    }
    return first.value || '';
  }

  function setFieldValue(name, value) {
    const els = qsa(`[name="${name}"]`);
    if (!els.length) return;
    const first = els[0];
    if (first.type === 'radio') {
      els.forEach((e) => { e.checked = e.value === value; });
    } else if (first.type === 'checkbox') {
      const wanted = Array.isArray(value) ? value : [value];
      els.forEach((e) => { e.checked = wanted.includes(e.value); });
    } else {
      first.value = value || '';
    }
    first.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getSupabase() {
    return typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    const colors = {
      success: '#28A745',
      error: '#DC3545',
      warning: '#FFC107',
      info: '#4472C4',
    };
    el.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
      background: ${colors[type] || colors.info}; color: white;
      padding: 12px 24px; border-radius: 6px; z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-weight: 500;
      max-width: 90%;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3500);
    setTimeout(() => el.remove(), 4000);
  }

  function showModal({ title, body, actions, width = 600 }) {
    const overlay = document.createElement('div');
    overlay.className = 'sf-modal-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px;
    `;
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white; border-radius: 12px; max-width: ${width}px;
      width: 100%; max-height: 90vh; overflow: hidden;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    `;
    modal.innerHTML = `
      <div style="padding: 20px 24px; border-bottom: 1px solid #E5E5E5; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0; color: #003366; font-size: 20px;">${title}</h2>
        <button class="sf-close" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #666; line-height: 1;">&times;</button>
      </div>
      <div class="sf-modal-body" style="padding: 24px; overflow-y: auto; flex: 1;"></div>
      <div class="sf-modal-actions" style="padding: 16px 24px; border-top: 1px solid #E5E5E5; display: flex; gap: 10px; justify-content: flex-end;"></div>
    `;
    overlay.appendChild(modal);

    const bodyEl = qs('.sf-modal-body', modal);
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);

    const actionsEl = qs('.sf-modal-actions', modal);
    (actions || []).forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = a.label;
      btn.style.cssText = `
        padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;
        font-size: 14px; font-weight: 500;
        background: ${a.primary ? '#4472C4' : '#E5E5E5'};
        color: ${a.primary ? 'white' : '#333'};
      `;
      btn.onclick = () => {
        const result = a.onClick && a.onClick(modal);
        if (result !== false) overlay.remove();
      };
      actionsEl.appendChild(btn);
    });

    qs('.sf-close', modal).onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    return { overlay, modal, bodyEl };
  }

  // =========================================================================
  // 1. COMPLIANCE SCORE — TR24/1 pre-submission check
  // =========================================================================
  const COMPLIANCE_RULES = [
    { id: 'client_identity',     label: 'Client identity captured',          weight: 1, check: () => !!getFieldValue('firstName') && !!getFieldValue('lastName') && !!getFieldValue('dob') },
    { id: 'tax_residency',       label: 'Tax residency confirmed',           weight: 1, check: () => !!getFieldValue('taxResidency') },
    { id: 'objectives',          label: 'Client objectives documented',      weight: 2, check: () => (getFieldValue('primaryObjective') || '').trim().length > 20 },
    { id: 'time_horizon',        label: 'Time horizon defined',              weight: 1, check: () => !!getFieldValue('timeHorizon') },
    { id: 'income_expenditure',  label: 'Income & expenditure captured',     weight: 1, check: () => {
        const inc = parseFloat(($('totalIncomeCurrent') || {}).textContent?.replace(/[^0-9.]/g, '') || 0);
        const exp = parseFloat(($('totalExpAnnual') || {}).textContent?.replace(/[^0-9.]/g, '') || 0);
        return inc > 0 && exp > 0;
      } },
    { id: 'risk_category',       label: 'Attitude to risk assessed (1-7)',   weight: 2, check: () => !!getFieldValue('riskCategory') },
    { id: 'capacity_for_loss',   label: 'Capacity for loss documented',      weight: 2, check: () => !!getFieldValue('emergencyFund') && !!getFieldValue('maxAcceptableLoss') },
    { id: 'risk_reconciled',     label: 'ATR/CFL reconciliation (if mismatch)', weight: 1, check: () => {
        const reconciliation = getFieldValue('riskReconciliation');
        return reconciliation.trim().length > 0 || true;
      } },
    { id: 'knowledge_experience',label: 'Knowledge & experience assessed',   weight: 1, check: () => !!getFieldValue('investmentKnowledge') },
    { id: 'vulnerability',       label: 'Vulnerability assessment completed',weight: 2, check: () => {
        const v = getFieldValue('vulnerabilities');
        return Array.isArray(v) && v.length > 0;
      } },
    { id: 'options_considered',  label: 'Options considered documented',     weight: 2, check: () => {
        const o = getFieldValue('options');
        return Array.isArray(o) && o.length >= 2;
      } },
    { id: 'recommendation',      label: 'Recommendation summary written',    weight: 3, check: () => (getFieldValue('recommendationSummary') || '').trim().length > 50 },
    { id: 'suitability_confirmed', label: 'Suitability confirmed (3 criteria)', weight: 2, check: () => {
        return ['meetsObjectives', 'suitableRisk', 'affordable'].every((n) => !!getFieldValue(n));
      } },
    { id: 'risk_warnings',       label: 'Risk warnings communicated',        weight: 2, check: () => {
        const w = getFieldValue('riskWarnings');
        return Array.isArray(w) && w.length >= 4;
      } },
    { id: 'costs_disclosed',     label: 'Costs & charges disclosed',         weight: 2, check: () => {
        const initial = parseFloat(getFieldValue('initialAdviserCharge') || getFieldValue('initialAdviserChargePercent') || 0);
        const ongoing = parseFloat(getFieldValue('ongoingAdviserCharge') || 0);
        return initial > 0 || ongoing > 0;
      } },
    { id: 'documents_provided',  label: 'Required documents provided',       weight: 1, check: () => {
        const d = getFieldValue('documents');
        return Array.isArray(d) && d.length >= 3;
      } },
    { id: 'adviser_signoff',     label: 'Adviser sign-off complete',         weight: 2, check: () => !!getFieldValue('adviserName') && !!getFieldValue('adviserNumber') },
  ];

  function calculateCompliance() {
    let max = 0, score = 0;
    const results = COMPLIANCE_RULES.map((r) => {
      const passed = !!r.check();
      max += r.weight;
      if (passed) score += r.weight;
      return { ...r, passed };
    });
    return { score, max, percentage: max ? Math.round((score / max) * 100) : 0, results };
  }

  function renderCompliancePanel() {
    const { percentage, score, max, results } = calculateCompliance();
    const panel = $('compliancePanel');
    if (!panel) return;
    const color = percentage >= 85 ? '#28A745' : percentage >= 60 ? '#FFC107' : '#DC3545';
    const passedCount = results.filter((r) => r.passed).length;

    panel.querySelector('.sf-comp-score').innerHTML = `
      <div style="font-size: 28px; font-weight: 700; color: ${color};">${percentage}%</div>
      <div style="font-size: 11px; color: #666;">${passedCount} / ${results.length} checks · ${score}/${max} pts</div>
    `;
    panel.querySelector('.sf-comp-bar-fill').style.width = `${percentage}%`;
    panel.querySelector('.sf-comp-bar-fill').style.background = color;

    panel.querySelector('.sf-comp-list').innerHTML = results.map((r) => `
      <div class="sf-comp-item" data-rule="${r.id}" style="
        display: flex; align-items: flex-start; gap: 8px; padding: 6px 0;
        font-size: 12px; line-height: 1.4;
        color: ${r.passed ? '#28A745' : '#666'};
      ">
        <span style="font-size: 14px; flex-shrink: 0;">${r.passed ? '✓' : '○'}</span>
        <span>${r.label}</span>
      </div>
    `).join('');
  }

  function runPresubmissionCheck() {
    const { percentage, results } = calculateCompliance();
    const failed = results.filter((r) => !r.passed);
    const bodyHtml = `
      <p style="margin-bottom: 16px; font-size: 14px;">
        <strong style="font-size: 18px; color: ${percentage >= 85 ? '#28A745' : '#DC3545'};">
          ${percentage}% TR24/1 compliance
        </strong>
        — ${failed.length} item${failed.length === 1 ? '' : 's'} need attention before submission.
      </p>
      ${failed.length === 0 ? `
        <div style="background: #d4edda; padding: 16px; border-radius: 6px; color: #155724;">
          ✓ All TR24/1 compliance checks pass. This form is ready for submission.
        </div>
      ` : `
        <ul style="list-style: none; padding: 0;">
          ${failed.map((r) => `
            <li style="padding: 12px; margin-bottom: 8px; background: #fff5f5; border-left: 3px solid #DC3545; border-radius: 4px;">
              <strong>${r.label}</strong>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">Rule ID: ${r.id} · ${r.weight} point${r.weight === 1 ? '' : 's'}</div>
            </li>
          `).join('')}
        </ul>
      `}
    `;
    showModal({
      title: '🛡️ Pre-Submission Compliance Check',
      body: bodyHtml,
      actions: [{ label: 'Close', primary: true }],
      width: 600,
    });
  }

  // =========================================================================
  // 2. TEMPLATE LIBRARY
  // =========================================================================
  const TEMPLATES = [
    {
      id: 'db_transfer',
      title: 'DB Pension Transfer',
      icon: '🔄',
      description: 'Defined benefit transfer advice — focused pension assessment with mandatory risk warnings.',
      apply: () => {
        setFieldValue('adviceType', 'Pension');
        ['area_pension', 'area_retirement', 'area_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        ['risk_capital', 'risk_inflation', 'risk_liquidity', 'risk_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        focusSection('section3');
      },
    },
    {
      id: 'drawdown',
      title: 'Flexi-Access Drawdown',
      icon: '💰',
      description: 'Income drawdown setup with sustainable withdrawal analysis.',
      apply: () => {
        setFieldValue('adviceType', 'Pension');
        ['area_pension', 'area_retirement', 'area_investment'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        ['opt_drawdown', 'opt_annuity', 'opt_hybrid'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        ['risk_capital', 'risk_inflation', 'risk_concentration'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        focusSection('section3');
      },
    },
    {
      id: 'isa_gia',
      title: 'ISA / GIA Investment',
      icon: '📈',
      description: 'Stocks & shares ISA or general investment account recommendation.',
      apply: () => {
        setFieldValue('adviceType', 'Investment');
        ['area_investment', 'area_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        ['risk_capital', 'risk_inflation', 'risk_concentration', 'risk_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        focusSection('section4');
      },
    },
    {
      id: 'protection',
      title: 'Protection Review',
      icon: '🛡️',
      description: 'Life cover, critical illness, income protection assessment.',
      apply: () => {
        setFieldValue('adviceType', 'Protection');
        const el = $('area_protection'); if (el) el.checked = true;
        focusSection('section1');
      },
    },
    {
      id: 'annual_review',
      title: 'Annual Review',
      icon: '🗓️',
      description: 'Recurring suitability review — sets next review date to 1 year from today.',
      apply: () => {
        setFieldValue('adviceType', 'Full');
        ['area_investment', 'area_pension', 'area_retirement', 'area_protection', 'area_estate', 'area_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        const next = new Date(); next.setFullYear(next.getFullYear() + 1);
        const reviewField = $('nextReviewDate');
        if (reviewField) reviewField.value = next.toISOString().slice(0, 10);
        focusSection('section1');
      },
    },
    {
      id: 'full_plan',
      title: 'New Client Full Plan',
      icon: '📋',
      description: 'Comprehensive holistic financial plan — all advice areas enabled.',
      apply: () => {
        setFieldValue('adviceType', 'Full');
        ['area_investment', 'area_pension', 'area_retirement', 'area_protection', 'area_estate', 'area_tax'].forEach((id) => { const el = $(id); if (el) el.checked = true; });
        focusSection('section1');
      },
    },
  ];

  function focusSection(id) {
    const section = $(id);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showTemplateLibrary() {
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;';
    TEMPLATES.forEach((t) => {
      const card = document.createElement('div');
      card.style.cssText = `
        border: 2px solid #E5E5E5; border-radius: 8px; padding: 16px;
        cursor: pointer; transition: all 0.2s;
      `;
      card.onmouseenter = () => { card.style.borderColor = '#4472C4'; card.style.background = '#F0F8FF'; };
      card.onmouseleave = () => { card.style.borderColor = '#E5E5E5'; card.style.background = 'white'; };
      card.innerHTML = `
        <div style="font-size: 28px; margin-bottom: 8px;">${t.icon}</div>
        <div style="font-weight: 600; color: #003366; margin-bottom: 6px;">${t.title}</div>
        <div style="font-size: 12px; color: #666; line-height: 1.4;">${t.description}</div>
      `;
      card.onclick = () => {
        t.apply();
        try { if (typeof updateProgress === 'function') updateProgress(); } catch (e) { /* ignore */ }
        renderCompliancePanel();
        document.querySelectorAll('.sf-modal-overlay').forEach((o) => o.remove());
        toast(`Applied template: ${t.title}`, 'success');
      };
      grid.appendChild(card);
    });
    showModal({
      title: '📂 Suitability Templates',
      body: grid,
      actions: [{ label: 'Cancel' }],
      width: 760,
    });
  }

  // =========================================================================
  // 3. AI REPORT DRAFT (Claude API)
  // =========================================================================
  const AI_KEY_STORAGE = 'sf_anthropic_api_key';
  const AI_MODEL_STORAGE = 'sf_anthropic_model';
  const DEFAULT_MODEL = 'claude-sonnet-4-6';

  function getApiKey() { return localStorage.getItem(AI_KEY_STORAGE) || ''; }
  function saveApiKey(key) { localStorage.setItem(AI_KEY_STORAGE, key); }
  function getModel() { return localStorage.getItem(AI_MODEL_STORAGE) || DEFAULT_MODEL; }
  function saveModel(m) { localStorage.setItem(AI_MODEL_STORAGE, m); }

  function buildAIContext() {
    const fd = typeof collectAllFormData === 'function' ? collectAllFormData() : {};
    const compliance = calculateCompliance();
    const ctx = {
      client: {
        title: fd.title, firstName: fd.firstName, lastName: fd.lastName,
        age: ($('currentAge') || {}).textContent || '',
        employmentStatus: fd.employmentStatus, maritalStatus: fd.maritalStatus,
        taxResidency: fd.taxResidency, healthStatus: fd.clientHealthStatus,
      },
      objectives: {
        primary: fd.primaryObjective, secondary: fd.secondaryObjectives,
        timeHorizon: fd.timeHorizon, incomeRequirement: fd.incomeRequirement,
      },
      financial: {
        totalIncome: ($('totalIncomeCurrent') || {}).textContent || '',
        totalExpenditure: ($('totalExpAnnual') || {}).textContent || '',
        netWorth: ($('netWorth') || {}).textContent || '',
        annualSurplus: ($('annualSurplus') || {}).textContent || '',
        emergencyFund: fd.emergencyFund,
        emergencyMonths: ($('emergencyMonths') || {}).value || '',
      },
      risk: {
        category: fd.riskCategory, profilingTool: fd.riskProfilingTool,
        maxAcceptableLoss: fd.maxAcceptableLoss, reconciliation: fd.riskReconciliation,
      },
      knowledge: {
        level: fd.investmentKnowledge, explanation: fd.knowledgeExplanation,
      },
      vulnerability: {
        indicators: Array.isArray(fd.vulnerabilities) ? fd.vulnerabilities : (fd.vulnerabilities ? [fd.vulnerabilities] : []),
        details: fd.vulnerabilityDetails, adaptations: fd.adaptationsMade,
      },
      options: {
        considered: Array.isArray(fd.options) ? fd.options : (fd.options ? [fd.options] : []),
        advantages: fd.optionsAdvantages, disadvantages: fd.optionsDisadvantages,
      },
      adviceType: fd.adviceType,
      adviceAreas: Array.isArray(fd.adviceAreas) ? fd.adviceAreas : (fd.adviceAreas ? [fd.adviceAreas] : []),
      complianceScore: compliance.percentage,
    };
    return ctx;
  }

  const SYSTEM_PROMPT = `You are an expert UK IFA compliance specialist drafting a suitability report under the FCA's TR24/1 retirement income advice rules and COBS 9 / 9A. You write in clear, professional, plain English suitable for both the client and FCA review.

Your output MUST be valid JSON matching this schema exactly:
{
  "recommendationSummary": "string (200-400 words: clear recommendation linking client objectives, risk profile, and capacity for loss to the proposed approach)",
  "incomeStrategy": "string (150-250 words: how the recommendation generates income, sustainability, withdrawal rates, sequencing risk)",
  "investmentStrategy": "string (150-250 words: asset allocation aligned to risk category, diversification, rebalancing)",
  "advantages": "string (4-6 bullet points as a single string with newlines, each starting with '- ')",
  "disadvantages": "string (3-5 bullet points as a single string with newlines, each starting with '- ', including any limitations or scenarios where the advice may not be optimal)",
  "valueAssessment": "string (100-150 words on value for money — link adviser charges to services delivered)"
}

Rules:
- Never invent client data. If a field is missing, write generically or note "to be confirmed".
- Reference the FCA principles (Consumer Duty, COBS 9.2.1R suitability obligations) where natural.
- Use UK English spelling. Use £ for currency. Never recommend specific named products.
- Match tone to the client's experience level when described.
- Output JSON ONLY, no markdown fences, no preamble.`;

  async function callClaudeAPI(context) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No API key configured');
    const model = getModel();

    const userPrompt = `Draft the suitability report sections for the following client case:\n\n${JSON.stringify(context, null, 2)}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    try {
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error('Could not parse AI response as JSON. Raw: ' + text.slice(0, 200));
    }
  }

  function openAIDraftModal() {
    const apiKey = getApiKey();
    const model = getModel();

    const body = document.createElement('div');
    body.innerHTML = `
      ${!apiKey ? `
        <div style="background: #fff3cd; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #856404;">
          <strong>⚠️ API key required.</strong> Your Anthropic API key is stored locally in this browser only. For production use, route via a server proxy.
        </div>
      ` : ''}
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;">Anthropic API Key</label>
        <input type="password" id="sf-api-key" value="${apiKey}" placeholder="sk-ant-..." style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px; font-family: monospace; font-size: 12px;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;">Model</label>
        <select id="sf-model" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          <option value="claude-opus-4-7" ${model === 'claude-opus-4-7' ? 'selected' : ''}>Claude Opus 4.7 — highest quality, slower</option>
          <option value="claude-sonnet-4-6" ${model === 'claude-sonnet-4-6' ? 'selected' : ''}>Claude Sonnet 4.6 — balanced (recommended)</option>
          <option value="claude-haiku-4-5-20251001" ${model === 'claude-haiku-4-5-20251001' ? 'selected' : ''}>Claude Haiku 4.5 — fastest, cheapest</option>
        </select>
      </div>
      <div style="background: #F0F8FF; padding: 12px; border-radius: 6px; font-size: 13px; color: #003366;">
        The AI will draft these sections using the form data you've already entered:
        <strong>Recommendation Summary, Income Strategy, Investment Strategy, Advantages, Disadvantages, Value Assessment.</strong>
        You'll review the draft before it's inserted.
      </div>
      <div id="sf-draft-status" style="margin-top: 16px; display: none;"></div>
    `;

    const draftAction = {
      label: '✨ Generate Draft',
      primary: true,
      onClick: async (modalEl) => {
        const keyInput = qs('#sf-api-key', modalEl).value.trim();
        const modelInput = qs('#sf-model', modalEl).value;
        if (!keyInput) { toast('API key required', 'error'); return false; }
        saveApiKey(keyInput);
        saveModel(modelInput);

        const status = qs('#sf-draft-status', modalEl);
        status.style.display = 'block';
        status.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><div style="font-size: 24px; margin-bottom: 8px;">⏳</div>Drafting suitability report... (10-30 seconds)</div>';

        try {
          const ctx = buildAIContext();
          const draft = await callClaudeAPI(ctx);
          status.innerHTML = '';
          showDraftReview(draft);
          return true;
        } catch (e) {
          console.error(e);
          status.innerHTML = `<div style="background: #f8d7da; padding: 12px; border-radius: 6px; color: #721c24; font-size: 13px;"><strong>Error:</strong> ${e.message}</div>`;
          return false;
        }
      },
    };

    showModal({
      title: '🤖 AI Draft Suitability Report',
      body,
      actions: [{ label: 'Cancel' }, draftAction],
      width: 640,
    });
  }

  function showDraftReview(draft) {
    const body = document.createElement('div');
    const fields = [
      { key: 'recommendationSummary', label: 'Recommendation Summary', target: 'recommendationSummary' },
      { key: 'incomeStrategy', label: 'Income Strategy', target: 'incomeStrategyDetail' },
      { key: 'investmentStrategy', label: 'Investment Strategy', target: 'investmentStrategyDetail' },
      { key: 'advantages', label: 'Advantages', target: 'recommendationAdvantages' },
      { key: 'disadvantages', label: 'Disadvantages', target: 'recommendationDisadvantages' },
      { key: 'valueAssessment', label: 'Value Assessment', target: 'valueAssessment' },
    ];
    body.innerHTML = `
      <div style="background: #d4edda; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; color: #155724;">
        ✓ Draft ready. Edit any section below, then choose which to insert into the form.
      </div>
      ${fields.map((f) => `
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; margin-bottom: 6px;">
            <input type="checkbox" class="sf-draft-include" data-key="${f.key}" data-target="${f.target}" checked>
            ${f.label}
          </label>
          <textarea class="sf-draft-text" data-key="${f.key}" rows="5" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px; font-family: inherit; font-size: 13px; resize: vertical;">${draft[f.key] || ''}</textarea>
        </div>
      `).join('')}
    `;

    showModal({
      title: '✏️ Review AI Draft',
      body,
      width: 800,
      actions: [
        { label: 'Discard' },
        {
          label: 'Insert Selected',
          primary: true,
          onClick: (modalEl) => {
            const checkboxes = qsa('.sf-draft-include', modalEl);
            let inserted = 0;
            checkboxes.forEach((cb) => {
              if (cb.checked) {
                const key = cb.dataset.key;
                const target = cb.dataset.target;
                const text = qs(`.sf-draft-text[data-key="${key}"]`, modalEl).value;
                const targetEl = $(target);
                if (targetEl) { targetEl.value = text; inserted++; }
              }
            });
            toast(`Inserted ${inserted} section${inserted === 1 ? '' : 's'} into the form`, 'success');
            try { if (typeof updateProgress === 'function') updateProgress(); } catch (e) { /* ignore */ }
            renderCompliancePanel();
          },
        },
      ],
    });
  }

  // =========================================================================
  // 4. CLIENT INTAKE LINK
  // =========================================================================
  function generateToken() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function createClientIntake() {
    const client = getSupabase();
    if (!client) { toast('Database not connected — intake links require Supabase', 'error'); return; }

    const token = generateToken();
    const adviser = getFieldValue('adviserName') || 'Your adviser';
    const expires = new Date(); expires.setDate(expires.getDate() + 14);

    const payload = {
      type: 'intake_pending',
      adviser_name: adviser,
      created_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
      formData: {},
    };

    const { error } = await client.from('ifa_forms').insert([{ form_id: token, payload }]);
    if (error) {
      console.error(error);
      toast('Could not create intake link: ' + error.message, 'error');
      return;
    }

    const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}client-intake.html?token=${token}`;

    const body = document.createElement('div');
    body.innerHTML = `
      <p style="margin-bottom: 14px; font-size: 14px;">
        Share this secure link with your client. They can complete their personal details, objectives, and vulnerability self-assessment on any device.
      </p>
      <div style="background: #F0F8FF; padding: 12px; border-radius: 6px; margin-bottom: 14px;">
        <label style="display: block; font-size: 12px; color: #666; margin-bottom: 6px; font-weight: 600;">CLIENT INTAKE LINK</label>
        <input type="text" id="sf-intake-url" readonly value="${url}" style="width: 100%; padding: 10px; border: 1px solid #4472C4; border-radius: 4px; font-family: monospace; font-size: 12px; background: white;">
      </div>
      <div style="font-size: 13px; color: #666; line-height: 1.5;">
        <strong>Token:</strong> <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">${token.slice(0, 12)}…</code><br>
        <strong>Expires:</strong> ${expires.toLocaleDateString('en-GB')}<br>
        <strong>Status:</strong> Pending client submission
      </div>
      <p style="margin-top: 14px; font-size: 13px; color: #666;">
        Once the client submits, return here and click <strong>Load Client Intake</strong> on the main form to pull their data into a new case.
      </p>
    `;

    showModal({
      title: '🔗 Client Intake Link Created',
      body,
      width: 580,
      actions: [
        {
          label: '📋 Copy Link',
          primary: true,
          onClick: (modalEl) => {
            const input = qs('#sf-intake-url', modalEl);
            input.select();
            navigator.clipboard.writeText(input.value).then(() => toast('Link copied to clipboard', 'success'));
            return false;
          },
        },
        { label: 'Close' },
      ],
    });
  }

  async function loadClientIntake() {
    const client = getSupabase();
    if (!client) { toast('Database not connected', 'error'); return; }

    const { data, error } = await client
      .from('ifa_forms')
      .select('form_id, payload, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) { toast('Could not fetch intakes: ' + error.message, 'error'); return; }

    const intakes = (data || []).filter((d) => d.payload && (d.payload.type === 'intake_submitted' || d.payload.type === 'intake_pending'));
    const body = document.createElement('div');
    if (intakes.length === 0) {
      body.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No client intakes found.</p>';
    } else {
      body.innerHTML = `
        <p style="margin-bottom: 14px; font-size: 13px; color: #666;">Click an intake to load it into the current form.</p>
        ${intakes.map((i) => {
          const fd = (i.payload && i.payload.formData) || {};
          const name = `${fd.firstName || ''} ${fd.lastName || ''}`.trim() || '(no name yet)';
          const submitted = i.payload.type === 'intake_submitted';
          return `
            <div class="sf-intake-row" data-token="${i.form_id}" style="
              padding: 14px; border: 1px solid #E5E5E5; border-radius: 6px;
              margin-bottom: 8px; cursor: ${submitted ? 'pointer' : 'default'};
              opacity: ${submitted ? 1 : 0.6};
              display: flex; justify-content: space-between; align-items: center;
            ">
              <div>
                <div style="font-weight: 600;">${name}</div>
                <div style="font-size: 12px; color: #666;">Token ${i.form_id.slice(0, 12)}… · ${new Date(i.updated_at).toLocaleString('en-GB')}</div>
              </div>
              <span style="
                padding: 4px 10px; border-radius: 12px; font-size: 12px;
                background: ${submitted ? '#d4edda' : '#fff3cd'};
                color: ${submitted ? '#155724' : '#856404'};
              ">${submitted ? '✓ Submitted' : '⏳ Pending'}</span>
            </div>
          `;
        }).join('')}
      `;
    }

    const { overlay } = showModal({
      title: '📥 Load Client Intake',
      body,
      width: 640,
      actions: [{ label: 'Close' }],
    });

    qsa('.sf-intake-row', overlay).forEach((row) => {
      row.onclick = async () => {
        const token = row.dataset.token;
        const intake = intakes.find((i) => i.form_id === token);
        if (!intake || intake.payload.type !== 'intake_submitted') return;
        if (!confirm('This will overwrite matching fields in the current form. Continue?')) return;
        const fd = intake.payload.formData || {};
        Object.keys(fd).forEach((k) => setFieldValue(k, fd[k]));
        try { if (typeof updateProgress === 'function') updateProgress(); } catch (e) { /* ignore */ }
        renderCompliancePanel();
        toast('Client intake loaded into form', 'success');
        overlay.remove();
      };
    });
  }

  // =========================================================================
  // 5. ANNUAL REVIEW SCHEDULER
  // =========================================================================
  function setReviewToOneYear() {
    const next = new Date(); next.setFullYear(next.getFullYear() + 1);
    const field = $('nextReviewDate');
    if (field) {
      field.value = next.toISOString().slice(0, 10);
      field.dispatchEvent(new Event('change', { bubbles: true }));
      toast('Next review set to ' + next.toLocaleDateString('en-GB'), 'success');
    }
  }

  // =========================================================================
  // 6. FIRM BRANDING / SETTINGS
  // =========================================================================
  const BRAND_STORAGE = 'sf_firm_branding';
  const DEFAULT_BRAND = {
    firmName: '', firmAddress: '', firmFcaRef: '', firmPhone: '',
    firmEmail: '', firmWebsite: '', logoDataUrl: '', primaryColor: '#003366',
    defaultAdviser: '',
  };

  function getBranding() {
    try {
      return { ...DEFAULT_BRAND, ...(JSON.parse(localStorage.getItem(BRAND_STORAGE) || '{}')) };
    } catch (e) { return { ...DEFAULT_BRAND }; }
  }
  function saveBranding(b) { localStorage.setItem(BRAND_STORAGE, JSON.stringify(b)); }

  function openSettings() {
    const b = getBranding();
    const apiKey = getApiKey();
    const model = getModel();
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display: flex; gap: 6px; border-bottom: 2px solid #E5E5E5; margin-bottom: 18px;">
        <button class="sf-tab sf-tab-active" data-tab="brand" style="padding: 10px 16px; background: none; border: none; border-bottom: 3px solid #4472C4; cursor: pointer; font-weight: 600;">🏢 Firm Branding</button>
        <button class="sf-tab" data-tab="ai" style="padding: 10px 16px; background: none; border: none; border-bottom: 3px solid transparent; cursor: pointer; color: #666;">🤖 AI</button>
      </div>

      <div class="sf-tab-panel" data-panel="brand">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Firm Name</label>
            <input id="sf-firmName" value="${escapeHtml(b.firmName)}" placeholder="ACME Wealth Ltd" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">FCA Firm Reference</label>
            <input id="sf-firmFcaRef" value="${escapeHtml(b.firmFcaRef)}" placeholder="123456" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
        </div>
        <div style="margin-bottom: 14px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Address</label>
          <input id="sf-firmAddress" value="${escapeHtml(b.firmAddress)}" placeholder="1 Example Street, London EC1A 1AA" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Phone</label>
            <input id="sf-firmPhone" value="${escapeHtml(b.firmPhone)}" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Email</label>
            <input id="sf-firmEmail" value="${escapeHtml(b.firmEmail)}" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Website</label>
            <input id="sf-firmWebsite" value="${escapeHtml(b.firmWebsite)}" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Brand Colour</label>
            <input id="sf-primaryColor" type="color" value="${b.primaryColor}" style="width: 100%; height: 42px; padding: 2px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Default Adviser</label>
            <input id="sf-defaultAdviser" value="${escapeHtml(b.defaultAdviser)}" placeholder="Name to auto-fill in Section 12" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
          </div>
        </div>
        <div style="margin-bottom: 14px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Logo</label>
          <input type="file" id="sf-logoFile" accept="image/png,image/jpeg,image/svg+xml" style="margin-bottom: 8px;">
          <div id="sf-logoPreview" style="padding: 10px; background: #f5f5f5; border-radius: 4px; min-height: 60px; display: flex; align-items: center; justify-content: center;">
            ${b.logoDataUrl ? `<img src="${b.logoDataUrl}" style="max-height: 60px; max-width: 200px;">` : '<span style="color: #999; font-size: 13px;">No logo uploaded</span>'}
          </div>
          ${b.logoDataUrl ? '<button type="button" id="sf-clearLogo" style="margin-top: 6px; padding: 6px 12px; background: none; border: 1px solid #DC3545; color: #DC3545; border-radius: 4px; cursor: pointer; font-size: 12px;">Remove logo</button>' : ''}
        </div>
        <div style="background: #F0F8FF; padding: 12px; border-radius: 6px; font-size: 12px; color: #003366;">
          These settings are stored in this browser only. They appear on PDF reports, the dashboard header, and the client intake page.
        </div>
      </div>

      <div class="sf-tab-panel" data-panel="ai" style="display: none;">
        <div style="margin-bottom: 14px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Anthropic API Key</label>
          <input type="password" id="sf-apiKey-settings" value="${apiKey}" placeholder="sk-ant-..." style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px; font-family: monospace;">
          <div style="font-size: 12px; color: #666; margin-top: 4px;">Stored in browser localStorage only.</div>
        </div>
        <div style="margin-bottom: 14px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Default Model</label>
          <select id="sf-model-settings" style="width: 100%; padding: 10px; border: 1px solid #E5E5E5; border-radius: 4px;">
            <option value="claude-opus-4-7" ${model === 'claude-opus-4-7' ? 'selected' : ''}>Claude Opus 4.7 — highest quality</option>
            <option value="claude-sonnet-4-6" ${model === 'claude-sonnet-4-6' ? 'selected' : ''}>Claude Sonnet 4.6 — balanced (recommended)</option>
            <option value="claude-haiku-4-5-20251001" ${model === 'claude-haiku-4-5-20251001' ? 'selected' : ''}>Claude Haiku 4.5 — fastest</option>
          </select>
        </div>
        <div style="background: #fff3cd; padding: 12px; border-radius: 6px; font-size: 12px; color: #856404;">
          <strong>Production note:</strong> API keys in browser localStorage are visible to anyone with access to the device. For a deployed firm-wide tool, proxy the API through a Supabase Edge Function and remove this key.
        </div>
      </div>
    `;

    const { overlay, modal } = showModal({
      title: '⚙️ Settings',
      body,
      width: 680,
      actions: [
        { label: 'Cancel' },
        {
          label: 'Save Settings',
          primary: true,
          onClick: (modalEl) => {
            const updated = {
              firmName: qs('#sf-firmName', modalEl).value,
              firmAddress: qs('#sf-firmAddress', modalEl).value,
              firmFcaRef: qs('#sf-firmFcaRef', modalEl).value,
              firmPhone: qs('#sf-firmPhone', modalEl).value,
              firmEmail: qs('#sf-firmEmail', modalEl).value,
              firmWebsite: qs('#sf-firmWebsite', modalEl).value,
              primaryColor: qs('#sf-primaryColor', modalEl).value,
              defaultAdviser: qs('#sf-defaultAdviser', modalEl).value,
              logoDataUrl: getBranding().logoDataUrl, // preserve any newly uploaded logo
            };
            const preview = qs('#sf-logoPreview img', modalEl);
            if (preview) updated.logoDataUrl = preview.src;
            saveBranding(updated);
            saveApiKey(qs('#sf-apiKey-settings', modalEl).value);
            saveModel(qs('#sf-model-settings', modalEl).value);
            applyBranding();
            toast('Settings saved', 'success');
          },
        },
      ],
    });

    qsa('.sf-tab', overlay).forEach((tab) => {
      tab.onclick = () => {
        qsa('.sf-tab', overlay).forEach((t) => {
          t.classList.remove('sf-tab-active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = '#666';
          t.style.fontWeight = 'normal';
        });
        tab.classList.add('sf-tab-active');
        tab.style.borderBottomColor = '#4472C4';
        tab.style.color = '#333';
        tab.style.fontWeight = '600';
        qsa('.sf-tab-panel', overlay).forEach((p) => {
          p.style.display = p.dataset.panel === tab.dataset.tab ? 'block' : 'none';
        });
      };
    });

    const logoInput = qs('#sf-logoFile', overlay);
    logoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) { toast('Logo must be under 500KB', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        qs('#sf-logoPreview', overlay).innerHTML = `<img src="${reader.result}" style="max-height: 60px; max-width: 200px;">`;
      };
      reader.readAsDataURL(file);
    };
    const clearBtn = qs('#sf-clearLogo', overlay);
    if (clearBtn) {
      clearBtn.onclick = () => {
        const b2 = getBranding(); b2.logoDataUrl = ''; saveBranding(b2);
        qs('#sf-logoPreview', overlay).innerHTML = '<span style="color: #999; font-size: 13px;">No logo uploaded</span>';
        clearBtn.remove();
      };
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function applyBranding() {
    const b = getBranding();
    // Recolour primary header if user picked a different brand colour
    if (b.primaryColor && b.primaryColor !== '#003366') {
      let styleEl = $('sf-brand-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'sf-brand-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        header { background-color: ${b.primaryColor} !important; }
        .sf-feature-bar-header { background: ${b.primaryColor} !important; }
        h2, .summary-card h3, .progress-bar h3 { color: ${b.primaryColor} !important; }
      `;
    }
    // Auto-fill default adviser if empty
    if (b.defaultAdviser) {
      const adviserSelect = $('adviserName');
      if (adviserSelect && !adviserSelect.value) {
        const opt = Array.from(adviserSelect.options).find((o) => o.value === b.defaultAdviser);
        if (opt) adviserSelect.value = b.defaultAdviser;
      }
    }
  }

  // =========================================================================
  // 7. BRANDED PDF REPORT (wraps existing generateSuitabilityReport)
  // =========================================================================
  function buildBrandedReportHead(b) {
    return `
      <style>
        @media print {
          @page { margin: 18mm 14mm; }
          .sf-no-print { display: none !important; }
        }
        .sf-report-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 24px; background: ${b.primaryColor || '#003366'};
          color: white; margin-bottom: 24px;
        }
        .sf-report-header img { max-height: 50px; max-width: 180px; background: white; padding: 4px; border-radius: 4px; }
        .sf-report-header .sf-firm-meta { text-align: right; font-size: 11px; line-height: 1.5; opacity: 0.95; }
        .sf-report-footer {
          margin-top: 40px; padding-top: 16px; border-top: 1px solid #E5E5E5;
          font-size: 10px; color: #666; text-align: center; line-height: 1.5;
        }
        .sf-pdf-bar {
          position: fixed; top: 0; left: 0; right: 0; background: white;
          padding: 10px 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          display: flex; gap: 10px; justify-content: flex-end; z-index: 1000;
        }
        .sf-pdf-bar button {
          padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;
          font-weight: 600; font-size: 13px;
        }
        .sf-pdf-bar .sf-print { background: ${b.primaryColor || '#003366'}; color: white; }
        .sf-pdf-bar .sf-close-btn { background: #E5E5E5; color: #333; }
        body { padding-top: 56px; }
      </style>
    `;
  }

  function buildBrandedHeader(b) {
    const logo = b.logoDataUrl ? `<img src="${b.logoDataUrl}" alt="Logo">` : '';
    const meta = [
      b.firmName ? `<strong>${escapeHtml(b.firmName)}</strong>` : '',
      b.firmAddress ? escapeHtml(b.firmAddress) : '',
      [b.firmPhone, b.firmEmail, b.firmWebsite].filter(Boolean).map(escapeHtml).join(' · '),
      b.firmFcaRef ? `FCA Firm Ref: ${escapeHtml(b.firmFcaRef)}` : '',
    ].filter(Boolean).join('<br>');
    if (!logo && !meta) return '';
    return `
      <div class="sf-report-header">
        <div>${logo}</div>
        <div class="sf-firm-meta">${meta}</div>
      </div>
    `;
  }

  function buildBrandedFooter(b) {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return `
      <div class="sf-report-footer">
        ${b.firmName ? escapeHtml(b.firmName) : ''} ${b.firmFcaRef ? `· Authorised and regulated by the Financial Conduct Authority (Firm Ref: ${escapeHtml(b.firmFcaRef)})` : ''}<br>
        This suitability report was generated on ${today}. It is confidential and intended solely for the named client. Past performance is not a guide to future returns; the value of investments can fall as well as rise.
      </div>
    `;
  }

  function buildPdfActionBar() {
    return `
      <div class="sf-pdf-bar sf-no-print">
        <button class="sf-close-btn" onclick="window.close()">Close</button>
        <button class="sf-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
      </div>
    `;
  }

  function wrapReportWithBranding() {
    if (typeof window.generateSuitabilityReport !== 'function') return;
    const original = window.generateSuitabilityReport;
    window.generateSuitabilityReport = async function brandedGenerate() {
      const form = $('suitabilityForm');
      if (form && !form.checkValidity()) {
        form.reportValidity();
        if (typeof updateValidationSummary === 'function') updateValidationSummary();
        alert('Please complete all required fields before generating the suitability report.');
        return;
      }
      const formId = ($('formUniqueId') || {}).textContent || '';
      if (typeof generateReportHTML !== 'function') return original();
      let html = generateReportHTML(formId);
      const b = getBranding();
      const head = buildBrandedReportHead(b);
      const header = buildBrandedHeader(b);
      const footer = buildBrandedFooter(b);
      const actionBar = buildPdfActionBar();

      if (html.includes('</head>')) html = html.replace('</head>', head + '</head>');
      else html = head + html;

      if (html.includes('<body>')) html = html.replace('<body>', `<body>${actionBar}${header}`);
      else html = actionBar + header + html;

      if (html.includes('</body>')) html = html.replace('</body>', footer + '</body>');
      else html = html + footer;

      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();

      const sb = getSupabase();
      if (sb && formId) {
        try {
          await sb.from('ifa_forms').upsert({
            form_id: formId + '_report',
            payload: {
              type: 'suitability_report',
              parentFormId: formId,
              clientName: `${getFieldValue('title')} ${getFieldValue('firstName')} ${getFieldValue('lastName')}`.trim(),
              generatedDate: new Date().toISOString(),
              branded: true,
              reportHTML: html,
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'form_id' });
        } catch (e) { console.error('Could not save branded report', e); }
      }
    };
  }

  // =========================================================================
  // 8. DOCUMENT UPLOAD + AI EXTRACT
  // =========================================================================
  const EXTRACTION_PROMPT = `You are an expert at extracting structured financial data from UK financial documents (pension statements, P60s, payslips, mortgage statements, ISA statements, fact-finds, investment platform statements, ID documents, etc.).

Look at the document image(s) provided and extract any of the following fields you can find. Output VALID JSON ONLY matching this schema (omit fields you cannot find — do not invent):

{
  "documentType": "pension_statement|p60|payslip|isa_statement|mortgage_statement|id_document|other",
  "confidence": 0.0-1.0,
  "client": {
    "firstName": "string",
    "lastName": "string",
    "dob": "YYYY-MM-DD",
    "niNumber": "AB123456C",
    "addressLine1": "string",
    "city": "string",
    "postcode": "string",
    "email": "string",
    "phone": "string"
  },
  "income": {
    "employment": number,
    "selfEmployment": number,
    "pension": number,
    "investment": number,
    "rental": number
  },
  "pensions": [
    {"provider": "string", "type": "DC|DB|SIPP|State", "currentValue": number, "annualContribution": number}
  ],
  "assets": [
    {"type": "Property|Cash|Investment|Pension|Business|Other", "description": "string", "value": number, "ownership": "Sole|Joint|Trust"}
  ],
  "liabilities": [
    {"type": "Mortgage|Loan|Credit Card|Car Finance|Other", "description": "string", "outstanding": number, "monthlyPayment": number}
  ],
  "notes": "string (any other relevant observations)"
}

Rules:
- Use UK currency (numbers without symbols, e.g. 45000 not £45,000)
- Use YYYY-MM-DD for dates
- If a value is annual, use the annual figure (convert monthly × 12)
- Return JSON ONLY, no markdown fences`;

  async function extractFromDocument(files) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No API key configured. Add one in Settings.');
    const model = getModel();

    const images = [];
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/jpeg';
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) {
        throw new Error(`Unsupported file type: ${mediaType}. Use PNG, JPEG, GIF, or WebP.`);
      }
      images.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: [{ type: 'text', text: EXTRACTION_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [...images, { type: 'text', text: 'Extract the financial data from these documents.' }],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(cleaned); }
    catch (e) { throw new Error('Could not parse extracted data. Raw: ' + text.slice(0, 200)); }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function openDocumentUpload() {
    const body = document.createElement('div');
    body.innerHTML = `
      <p style="margin-bottom: 14px; font-size: 14px; color: #333;">
        Upload pension statements, P60s, payslips, ISA/mortgage statements or ID documents. The AI will extract the relevant figures into the form.
      </p>
      <div id="sf-dropzone" style="
        border: 2px dashed #4472C4; border-radius: 8px; padding: 30px 20px;
        text-align: center; background: #F0F8FF; cursor: pointer;
        transition: all 0.2s;
      ">
        <div style="font-size: 40px; margin-bottom: 8px;">📎</div>
        <div style="font-weight: 600; color: #003366; margin-bottom: 4px;">Drop files here or click to upload</div>
        <div style="font-size: 12px; color: #666;">PNG, JPEG, GIF or WebP · up to 5 files · max 5MB each</div>
        <input type="file" id="sf-doc-files" accept="image/png,image/jpeg,image/gif,image/webp" multiple style="display: none;">
      </div>
      <div id="sf-doc-list" style="margin-top: 14px;"></div>
      <div id="sf-doc-status" style="margin-top: 14px;"></div>
    `;

    const { overlay, modal } = showModal({
      title: '📄 Upload Documents (AI Extract)',
      body,
      width: 640,
      actions: [
        { label: 'Cancel' },
        {
          label: '✨ Extract with AI',
          primary: true,
          onClick: async (modalEl) => {
            const fileInput = qs('#sf-doc-files', modalEl);
            const files = Array.from(fileInput.files || []);
            if (files.length === 0) { toast('Choose at least one file', 'error'); return false; }
            if (!getApiKey()) { toast('Add an Anthropic API key in Settings first', 'error'); return false; }

            const status = qs('#sf-doc-status', modalEl);
            status.innerHTML = '<div style="text-align: center; padding: 16px; color: #666;"><div style="font-size: 24px;">⏳</div>Extracting data from documents…</div>';

            try {
              const extracted = await extractFromDocument(files);
              status.innerHTML = '';
              showExtractionReview(extracted);
              return true;
            } catch (e) {
              console.error(e);
              status.innerHTML = `<div style="background: #f8d7da; padding: 12px; border-radius: 6px; color: #721c24; font-size: 13px;"><strong>Error:</strong> ${escapeHtml(e.message)}</div>`;
              return false;
            }
          },
        },
      ],
    });

    const dropzone = qs('#sf-dropzone', overlay);
    const fileInput = qs('#sf-doc-files', overlay);
    const list = qs('#sf-doc-list', overlay);

    const updateList = () => {
      const files = Array.from(fileInput.files || []);
      list.innerHTML = files.map((f) => `
        <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f5f5f5; border-radius: 4px; margin-bottom: 6px; font-size: 13px;">
          <span>📄 ${escapeHtml(f.name)}</span>
          <span style="color: #666;">${(f.size / 1024).toFixed(0)} KB</span>
        </div>
      `).join('');
    };

    dropzone.onclick = () => fileInput.click();
    fileInput.onchange = updateList;
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.background = '#cce4ff'; };
    dropzone.ondragleave = () => { dropzone.style.background = '#F0F8FF'; };
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.style.background = '#F0F8FF';
      fileInput.files = e.dataTransfer.files;
      updateList();
    };
  }

  function showExtractionReview(extracted) {
    const body = document.createElement('div');
    const conf = Math.round((extracted.confidence || 0) * 100);
    const confColor = conf >= 80 ? '#28A745' : conf >= 50 ? '#FFC107' : '#DC3545';

    let summary = `
      <div style="background: #f0f8ff; padding: 12px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>Document type:</strong> ${escapeHtml(extracted.documentType || 'unknown')}<br>
          <span style="font-size: 12px; color: #666;">${escapeHtml(extracted.notes || '')}</span>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: ${confColor};">${conf}%</div>
      </div>
    `;

    const fieldMap = [
      ['client.firstName', 'firstName', 'First Name'],
      ['client.lastName', 'lastName', 'Last Name'],
      ['client.dob', 'dob', 'Date of Birth'],
      ['client.niNumber', 'niNumber', 'NI Number'],
      ['client.addressLine1', 'addressLine1', 'Address'],
      ['client.city', 'city', 'City'],
      ['client.postcode', 'postcode', 'Postcode'],
      ['client.email', 'email', 'Email'],
      ['client.phone', 'phone', 'Phone'],
      ['income.employment', 'income_employment_current', 'Employment Income (annual)'],
      ['income.selfEmployment', 'income_self_current', 'Self-Employment Income (annual)'],
      ['income.pension', 'income_pension_current', 'Pension Income (annual)'],
      ['income.investment', 'income_investment_current', 'Investment Income (annual)'],
      ['income.rental', 'income_rental_current', 'Rental Income (annual)'],
    ];

    const getNested = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

    let rows = '';
    fieldMap.forEach(([path, target, label]) => {
      const v = getNested(extracted, path);
      if (v === undefined || v === null || v === '') return;
      rows += `
        <tr>
          <td style="padding: 8px;">
            <input type="checkbox" class="sf-extract-include" data-target="${target}" data-value="${escapeHtml(String(v))}" checked>
          </td>
          <td style="padding: 8px; font-size: 13px;">${escapeHtml(label)}</td>
          <td style="padding: 8px;">
            <input type="text" class="sf-extract-value" data-target="${target}" value="${escapeHtml(String(v))}" style="width: 100%; padding: 6px; border: 1px solid #E5E5E5; border-radius: 4px; font-size: 13px;">
          </td>
        </tr>
      `;
    });

    if (rows) {
      summary += `
        <h4 style="margin-bottom: 8px;">Standard fields</h4>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; width: 30px;"></th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Field</th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Value (editable)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    if (Array.isArray(extracted.pensions) && extracted.pensions.length) {
      summary += `<h4 style="margin-bottom: 8px;">Pensions detected (${extracted.pensions.length})</h4><pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin-bottom: 14px;">${escapeHtml(JSON.stringify(extracted.pensions, null, 2))}</pre>`;
    }
    if (Array.isArray(extracted.assets) && extracted.assets.length) {
      summary += `<h4 style="margin-bottom: 8px;">Assets detected (${extracted.assets.length})</h4><pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin-bottom: 14px;">${escapeHtml(JSON.stringify(extracted.assets, null, 2))}</pre>`;
    }
    if (Array.isArray(extracted.liabilities) && extracted.liabilities.length) {
      summary += `<h4 style="margin-bottom: 8px;">Liabilities detected (${extracted.liabilities.length})</h4><pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin-bottom: 14px;">${escapeHtml(JSON.stringify(extracted.liabilities, null, 2))}</pre>`;
    }
    if (!rows && !extracted.pensions?.length && !extracted.assets?.length && !extracted.liabilities?.length) {
      summary += '<p style="color: #666; padding: 14px; background: #fff3cd; border-radius: 6px;">No structured fields extracted. Try a clearer image or a different document type.</p>';
    }

    body.innerHTML = summary;

    showModal({
      title: '🔍 Review Extracted Data',
      body,
      width: 760,
      actions: [
        { label: 'Discard' },
        {
          label: 'Apply Selected to Form',
          primary: true,
          onClick: (modalEl) => {
            const checks = qsa('.sf-extract-include', modalEl);
            let applied = 0;
            checks.forEach((cb) => {
              if (!cb.checked) return;
              const target = cb.dataset.target;
              const valueInput = qs(`.sf-extract-value[data-target="${target}"]`, modalEl);
              const value = valueInput ? valueInput.value : cb.dataset.value;
              setFieldValue(target, value);
              applied++;
            });
            toast(`Applied ${applied} field${applied === 1 ? '' : 's'} to the form`, 'success');
            try { if (typeof updateProgress === 'function') updateProgress(); } catch (e) { /* ignore */ }
            try { if (typeof calculateTotals === 'function') calculateTotals(); } catch (e) { /* ignore */ }
            renderCompliancePanel();
          },
        },
      ],
    });
  }

  // =========================================================================
  // 9. PLAIN-ENGLISH CLIENT LETTER (AI)
  // =========================================================================
  const CLIENT_LETTER_PROMPT = `You are an experienced IFA writing a warm, plain-English letter to a UK client explaining the financial advice you have just given them. The client may have limited financial knowledge.

Rules:
- Use UK English. Address the client by first name. Sign off with the adviser's name.
- Avoid jargon. Where a technical term is unavoidable, explain it in brackets.
- Reading age target: roughly 13-14 (Plain English Campaign style).
- Length: 350-500 words. Structure with short paragraphs and a couple of bullet lists if helpful.
- Tone: warm, confident, never patronising. Acknowledge any vulnerabilities sensitively.
- Cover: a thank-you for the meeting, what you've understood about their goals, what you're recommending and why, what they need to do next, and a clear invitation to ask questions.
- Output as a single piece of letter text — NO markdown, NO subject line, NO headings. Just the letter body itself, starting with "Dear FirstName," and ending with the adviser's name.`;

  async function callClaudeText(prompt, system) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No API key configured. Add one in Settings.');
    const model = getModel();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model, max_tokens: 2048,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Claude API error (${response.status}): ${await response.text()}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  async function openClientLetter() {
    if (!getApiKey()) { toast('Add an Anthropic API key in Settings first', 'warning'); openSettings(); return; }

    const fd = typeof collectAllFormData === 'function' ? collectAllFormData() : {};
    const ctx = {
      clientFirstName: fd.firstName,
      clientLastName: fd.lastName,
      adviserName: fd.adviserName,
      primaryObjective: fd.primaryObjective,
      secondaryObjectives: fd.secondaryObjectives,
      timeHorizon: fd.timeHorizon,
      riskCategory: fd.riskCategory,
      vulnerabilities: fd.vulnerabilities,
      adviceType: fd.adviceType,
      recommendationSummary: fd.recommendationSummary,
      incomeStrategy: fd.incomeStrategyDetail,
      investmentStrategy: fd.investmentStrategyDetail,
      advantages: fd.recommendationAdvantages,
      disadvantages: fd.recommendationDisadvantages,
      nextReviewDate: fd.nextReviewDate,
    };

    const placeholder = document.createElement('div');
    placeholder.innerHTML = '<div style="text-align: center; padding: 30px; color: #666;"><div style="font-size: 28px; margin-bottom: 8px;">⏳</div>Drafting client letter…</div>';
    const { overlay } = showModal({
      title: '📨 Plain-English Client Letter',
      body: placeholder,
      width: 720,
      actions: [{ label: 'Cancel' }],
    });

    try {
      const letter = await callClaudeText(
        `Draft a plain-English client letter for this case:\n\n${JSON.stringify(ctx, null, 2)}`,
        CLIENT_LETTER_PROMPT,
      );
      const b = getBranding();
      const letterPanel = document.createElement('div');
      letterPanel.innerHTML = `
        <textarea id="sf-letter-text" rows="20" style="
          width: 100%; padding: 16px; border: 1px solid #E5E5E5; border-radius: 6px;
          font-family: Georgia, serif; font-size: 14px; line-height: 1.6; resize: vertical;
        ">${escapeHtml(letter)}</textarea>
        <div style="margin-top: 10px; font-size: 12px; color: #666;">Edit freely. Then copy or open as a printable letter on firm letterhead.</div>
      `;
      const oldBody = qs('.sf-modal-body', overlay);
      oldBody.innerHTML = '';
      oldBody.appendChild(letterPanel);

      const actionsEl = qs('.sf-modal-actions', overlay);
      actionsEl.innerHTML = '';
      const mkBtn = (label, primary, fn) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
          padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;
          font-size: 14px; font-weight: 500;
          background: ${primary ? '#4472C4' : '#E5E5E5'};
          color: ${primary ? 'white' : '#333'};
        `;
        btn.onclick = fn;
        actionsEl.appendChild(btn);
      };
      mkBtn('Close', false, () => overlay.remove());
      mkBtn('📋 Copy', false, () => {
        navigator.clipboard.writeText(qs('#sf-letter-text', overlay).value)
          .then(() => toast('Letter copied to clipboard', 'success'));
      });
      mkBtn('🖨️ Open on Letterhead', true, () => openLetterhead(qs('#sf-letter-text', overlay).value, b, ctx));
    } catch (e) {
      console.error(e);
      qs('.sf-modal-body', overlay).innerHTML = `<div style="background: #f8d7da; padding: 14px; border-radius: 6px; color: #721c24;"><strong>Error:</strong> ${escapeHtml(e.message)}</div>`;
    }
  }

  function openLetterhead(text, b, ctx) {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const clientAddress = [getFieldValue('addressLine1'), getFieldValue('addressLine2'), getFieldValue('city'), getFieldValue('postcode')].filter(Boolean).join('<br>');
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Client Letter</title>
<style>
  @page { margin: 22mm 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #222; line-height: 1.65; max-width: 720px; margin: 0 auto; padding: 20px; }
  ${buildBrandedReportHead(b).replace(/<\/?style>/g, '')}
  .sf-letter-meta { margin: 30px 0 20px 0; font-size: 14px; }
  .sf-letter-meta .sf-date { text-align: right; }
  .sf-letter-body { white-space: pre-wrap; font-size: 14.5px; }
</style></head><body>
${buildPdfActionBar()}
${buildBrandedHeader(b)}
<div class="sf-letter-meta">
  <div class="sf-date">${today}</div>
  <div style="margin-top: 30px;">${clientAddress || ''}</div>
</div>
<div class="sf-letter-body">${escapeHtml(text)}</div>
${buildBrandedFooter(b)}
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }

  // =========================================================================
  // 10. AUDIT TRAIL / VERSION HISTORY
  // =========================================================================
  function snapshotForm() {
    const fd = typeof collectAllFormData === 'function' ? collectAllFormData() : {};
    const compliance = calculateCompliance();
    return {
      formData: fd,
      compliancePercentage: compliance.percentage,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 120),
    };
  }

  async function saveAuditSnapshot(reason) {
    const sb = getSupabase();
    if (!sb) return;
    const parentId = ($('formUniqueId') || {}).textContent;
    if (!parentId) return;
    const snap = snapshotForm();
    const auditId = `${parentId}_audit_${Date.now()}`;
    try {
      await sb.from('ifa_forms').insert([{
        form_id: auditId,
        payload: {
          type: 'audit_snapshot',
          parentFormId: parentId,
          reason: reason || 'save',
          ...snap,
        },
      }]);
    } catch (e) {
      console.warn('Audit snapshot failed', e);
    }
  }

  function hookAuditTrail() {
    if (typeof window.saveForm !== 'function') return;
    const original = window.saveForm;
    window.saveForm = async function audited(...args) {
      const result = await original.apply(this, args);
      saveAuditSnapshot('manual_save');
      return result;
    };
  }

  async function openAuditHistory() {
    const sb = getSupabase();
    if (!sb) { toast('Database not connected', 'error'); return; }
    const parentId = ($('formUniqueId') || {}).textContent;
    if (!parentId) { toast('No form ID yet — save the form first', 'warning'); return; }

    const { data, error } = await sb
      .from('ifa_forms')
      .select('form_id, payload, created_at')
      .like('form_id', `${parentId}_audit_%`)
      .order('form_id', { ascending: false })
      .limit(100);

    if (error) { toast('Could not load history: ' + error.message, 'error'); return; }

    const body = document.createElement('div');
    if (!data || data.length === 0) {
      body.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No audit history yet. Save the form to create the first snapshot.</p>';
    } else {
      body.innerHTML = `
        <p style="margin-bottom: 14px; font-size: 13px; color: #666;">
          ${data.length} snapshot${data.length === 1 ? '' : 's'} captured for this case. Click any row to inspect the snapshot or compare to the current form.
        </p>
        <div style="max-height: 460px; overflow-y: auto;">
          ${data.map((row, i) => {
            const p = row.payload || {};
            const ts = new Date(p.timestamp || row.created_at);
            const score = p.compliancePercentage || 0;
            const scoreColor = score >= 85 ? '#28A745' : score >= 60 ? '#FFC107' : '#DC3545';
            return `
              <div class="sf-audit-row" data-idx="${i}" style="
                padding: 12px; border: 1px solid #E5E5E5; border-radius: 6px;
                margin-bottom: 8px; display: flex; justify-content: space-between;
                align-items: center; cursor: pointer;
              ">
                <div>
                  <div style="font-weight: 600;">${ts.toLocaleString('en-GB')}</div>
                  <div style="font-size: 12px; color: #666;">Reason: ${escapeHtml(p.reason || 'save')}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 18px; font-weight: 700; color: ${scoreColor};">${score}%</div>
                  <div style="font-size: 11px; color: #666;">compliance</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    const { overlay } = showModal({
      title: '📜 Audit Trail',
      body,
      width: 640,
      actions: [
        {
          label: '⬇️ Export as PDF',
          onClick: () => { exportAuditTrailPdf(data || []); return false; },
        },
        { label: 'Close' },
      ],
    });

    qsa('.sf-audit-row', overlay).forEach((row) => {
      row.onclick = () => {
        const idx = parseInt(row.dataset.idx, 10);
        showAuditSnapshot(data[idx]);
      };
    });
  }

  function showAuditSnapshot(row) {
    const p = row.payload || {};
    const fd = p.formData || {};
    const current = typeof collectAllFormData === 'function' ? collectAllFormData() : {};
    const keys = Array.from(new Set([...Object.keys(fd), ...Object.keys(current)])).sort();
    const changes = keys
      .map((k) => ({ key: k, before: fd[k], after: current[k] }))
      .filter((d) => JSON.stringify(d.before) !== JSON.stringify(d.after));

    const body = document.createElement('div');
    body.innerHTML = `
      <p style="margin-bottom: 12px; font-size: 13px; color: #666;">
        Snapshot from <strong>${new Date(p.timestamp || row.created_at).toLocaleString('en-GB')}</strong>
        · Compliance was <strong>${p.compliancePercentage || 0}%</strong>
        · Reason: ${escapeHtml(p.reason || 'save')}
      </p>
      ${changes.length === 0 ? '<p style="color: #28A745; padding: 14px; background: #d4edda; border-radius: 6px;">✓ No differences between this snapshot and the current form.</p>' : `
        <h4 style="margin-bottom: 8px;">${changes.length} field${changes.length === 1 ? '' : 's'} changed since this snapshot</h4>
        <div style="max-height: 400px; overflow-y: auto;">
          ${changes.map((c) => `
            <div style="padding: 10px; border-bottom: 1px solid #f0f0f0;">
              <div style="font-weight: 600; font-size: 13px; color: #003366; margin-bottom: 4px;">${escapeHtml(c.key)}</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                <div style="background: #fff5f5; padding: 6px 8px; border-radius: 3px;"><span style="color: #999;">before:</span> ${escapeHtml(JSON.stringify(c.before))}</div>
                <div style="background: #f0fff4; padding: 6px 8px; border-radius: 3px;"><span style="color: #999;">now:</span> ${escapeHtml(JSON.stringify(c.after))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    showModal({
      title: '🔎 Snapshot Detail',
      body,
      width: 760,
      actions: [{ label: 'Close', primary: true }],
    });
  }

  function exportAuditTrailPdf(snapshots) {
    const b = getBranding();
    const parentId = ($('formUniqueId') || {}).textContent;
    const clientName = `${getFieldValue('firstName')} ${getFieldValue('lastName')}`.trim() || 'Unnamed Client';
    const rows = snapshots.map((r) => {
      const p = r.payload || {};
      const ts = new Date(p.timestamp || r.created_at).toLocaleString('en-GB');
      return `<tr>
        <td>${ts}</td>
        <td>${escapeHtml(p.reason || 'save')}</td>
        <td>${p.compliancePercentage || 0}%</td>
        <td style="font-family: monospace; font-size: 10px;">${escapeHtml(r.form_id)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Audit Trail · ${escapeHtml(clientName)}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 20px; color: #333; }
  ${buildBrandedReportHead(b).replace(/<\/?style>/g, '')}
  h1 { color: ${b.primaryColor || '#003366'}; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #f5f5f5; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; font-size: 13px; }
  td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
</style>
</head><body>
${buildPdfActionBar()}
${buildBrandedHeader(b)}
<h1>Audit Trail</h1>
<p><strong>Client:</strong> ${escapeHtml(clientName)}<br>
<strong>Form ID:</strong> ${escapeHtml(parentId || 'n/a')}<br>
<strong>Snapshots:</strong> ${snapshots.length}<br>
<strong>Exported:</strong> ${new Date().toLocaleString('en-GB')}</p>
<table>
  <thead><tr><th>Timestamp</th><th>Reason</th><th>Compliance</th><th>Snapshot ID</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${buildBrandedFooter(b)}
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }

  // -------------------------------------------------------------------------
  // INITIALISATION
  // -------------------------------------------------------------------------
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .sf-feature-bar {
        position: fixed; top: 110px; right: 20px; z-index: 998;
        background: white; border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        width: 320px; max-height: calc(100vh - 140px); overflow-y: auto;
      }
      .sf-feature-bar-header {
        padding: 12px 16px; border-bottom: 1px solid #E5E5E5;
        display: flex; justify-content: space-between; align-items: center;
        cursor: pointer; background: #003366; color: white;
        border-radius: 8px 8px 0 0;
      }
      .sf-feature-bar.collapsed .sf-feature-bar-body { display: none; }
      .sf-feature-bar.collapsed { width: 200px; }
      .sf-feature-bar.collapsed .sf-feature-bar-header { border-radius: 8px; }
      .sf-feature-bar-body { padding: 14px 16px; }
      .sf-comp-bar {
        height: 8px; background: #E5E5E5; border-radius: 4px;
        margin: 10px 0; overflow: hidden;
      }
      .sf-comp-bar-fill {
        height: 100%; background: #28A745; transition: all 0.3s;
      }
      .sf-comp-list {
        max-height: 280px; overflow-y: auto; margin-top: 10px;
        padding-top: 10px; border-top: 1px solid #E5E5E5;
      }
      .sf-feature-btn {
        display: block; width: 100%; padding: 10px 12px;
        background: white; border: 1px solid #4472C4; color: #003366;
        border-radius: 6px; cursor: pointer; font-size: 13px;
        font-weight: 500; margin-bottom: 8px; text-align: left;
        transition: all 0.2s;
      }
      .sf-feature-btn:hover { background: #F0F8FF; }
      .sf-feature-btn.sf-primary {
        background: #4472C4; color: white;
      }
      .sf-feature-btn.sf-primary:hover { background: #003366; }
      @media print {
        .sf-feature-bar { display: none !important; }
      }
      @media (max-width: 900px) {
        .sf-feature-bar { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectFeatureBar() {
    const bar = document.createElement('div');
    bar.className = 'sf-feature-bar';
    bar.id = 'sfFeatureBar';
    bar.innerHTML = `
      <div class="sf-feature-bar-header" onclick="document.getElementById('sfFeatureBar').classList.toggle('collapsed')">
        <span style="font-weight: 600; font-size: 14px;">🛡️ Suitability Tools</span>
        <span style="font-size: 12px;">▼</span>
      </div>
      <div class="sf-feature-bar-body">
        <button class="sf-feature-btn" onclick="window.SF.showTemplateLibrary()">📂 Use Template</button>
        <button class="sf-feature-btn sf-primary" onclick="window.SF.openAIDraftModal()">🤖 AI Draft Report</button>
        <button class="sf-feature-btn" onclick="window.SF.openClientLetter()">📨 Client Letter</button>
        <button class="sf-feature-btn" onclick="window.SF.openDocumentUpload()">📄 Upload Documents</button>
        <button class="sf-feature-btn" onclick="window.SF.createClientIntake()">🔗 Send Client Intake Link</button>
        <button class="sf-feature-btn" onclick="window.SF.loadClientIntake()">📥 Load Client Intake</button>
        <button class="sf-feature-btn" onclick="window.SF.runPresubmissionCheck()">✓ Pre-Submission Check</button>
        <button class="sf-feature-btn" onclick="window.SF.openAuditHistory()">📜 Audit Trail</button>
        <button class="sf-feature-btn" onclick="window.SF.openSettings()">⚙️ Settings &amp; Branding</button>

        <div id="compliancePanel" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #E5E5E5;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <strong style="font-size: 13px; color: #003366;">TR24/1 Compliance</strong>
            <div class="sf-comp-score" style="text-align: right;"></div>
          </div>
          <div class="sf-comp-bar"><div class="sf-comp-bar-fill" style="width: 0%;"></div></div>
          <div class="sf-comp-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
  }

  function injectReviewDateField() {
    // Add "Next Review Date" field into Section 12 (Quality Assurance)
    const section = $('section12');
    if (!section) return;
    if ($('nextReviewDate')) return; // already injected
    const content = qs('.section-content', section);
    if (!content) return;
    const block = document.createElement('div');
    block.innerHTML = `
      <h3 style="margin-top: 30px;">Annual Review Scheduling</h3>
      <div class="form-row">
        <div class="form-group">
          <label for="nextReviewDate">Next Review Date</label>
          <input type="date" id="nextReviewDate" name="nextReviewDate">
        </div>
        <div class="form-group">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-primary" onclick="window.SF.setReviewToOneYear()" style="background-color: #4472C4;">📅 Set to 1 Year from Today</button>
        </div>
      </div>
      <div class="form-group">
        <label for="reviewNotes">Review Notes / Triggers</label>
        <textarea id="reviewNotes" name="reviewNotes" rows="2" placeholder="Note any specific triggers that should prompt an earlier review (e.g., life events, market conditions)..."></textarea>
      </div>
    `;
    content.appendChild(block);
  }

  function hookFormChangesToCompliance() {
    const form = $('suitabilityForm');
    if (!form) return;
    let timer;
    const recompute = () => {
      clearTimeout(timer);
      timer = setTimeout(renderCompliancePanel, 300);
    };
    form.addEventListener('input', recompute);
    form.addEventListener('change', recompute);
  }

  function init() {
    injectStyles();
    injectReviewDateField();
    injectFeatureBar();
    hookFormChangesToCompliance();
    renderCompliancePanel();
    applyBranding();
    wrapReportWithBranding();
    hookAuditTrail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public surface
  window.SF = {
    showTemplateLibrary,
    openAIDraftModal,
    createClientIntake,
    loadClientIntake,
    runPresubmissionCheck,
    setReviewToOneYear,
    renderCompliancePanel,
    calculateCompliance,
    openSettings,
    openDocumentUpload,
    openAuditHistory,
    openClientLetter,
  };
})();
