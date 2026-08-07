let thorOperatorGateVisible = false;
let thorOperatorGateLoading = false;

function thorOperatorGateContext() {
  const context = state.status?.context || {};
  return {
    branch: context.branch_name || 'Filial',
    pos: context.pos_name || context.pos_code || 'PDV',
  };
}

function thorOperatorGateRemove() {
  document.getElementById('thorOperatorGate')?.remove();
  thorOperatorGateVisible = false;
  try { v3State().operatorPromptOpen = false; } catch {}
}

async function thorOperatorGateShow(message = '') {
  if (!state.status?.enrolled) return;
  const current = state.status?.operator || (() => { try { return v3State().operator; } catch { return null; } })();
  if (current) {
    thorOperatorGateRemove();
    return;
  }
  if (thorOperatorGateLoading) return;
  thorOperatorGateLoading = true;
  try {
    try { v3State().operatorPromptOpen = true; } catch {}
    let operators = [];
    try { operators = await window.thor.operators(); } catch {}
    const context = thorOperatorGateContext();
    let gate = document.getElementById('thorOperatorGate');
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'thorOperatorGate';
      gate.className = 'operator-gate';
      document.body.appendChild(gate);
    }
    thorOperatorGateVisible = true;
    gate.innerHTML = `
      <section class="operator-gate-card">
        <div class="operator-gate-brand">ϟ THOR<span>PDV</span></div>
        <div class="operator-gate-terminal">
          <span>${esc(context.branch)}</span>
          <b>${esc(context.pos)}</b>
        </div>
        <div class="operator-gate-copy">
          <small>ACESSO AO FRENTE DE CAIXA</small>
          <h1>Identifique o operador</h1>
          <p>Selecione seu usuário e informe o PIN. As permissões do perfil serão carregadas antes de liberar o caixa.</p>
        </div>
        ${operators.length ? `
          <label class="operator-gate-field"><span>Usuário PDV</span><select id="gateOperator">${operators.map(o => `<option value="${esc(o.id)}">${esc(o.name)} — ${esc(o.profile_name || 'PDV')}</option>`).join('')}</select></label>
          <label class="operator-gate-field"><span>PIN</span><input id="gatePin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Digite seu PIN"></label>
          <div id="gateError" class="operator-gate-error">${esc(message)}</div>
          <button id="gateLogin" class="operator-gate-primary">Entrar no caixa <kbd>Enter</kbd></button>
        ` : `
          <div class="operator-gate-warning">Nenhum operador PDV está disponível neste terminal. Sincronize para baixar os usuários e perfis do Gestão.</div>
          <div id="gateError" class="operator-gate-error">${esc(message)}</div>
          <button id="gateSync" class="operator-gate-primary">Sincronizar operadores</button>
        `}
        <div class="operator-gate-foot"><span>Terminal pareado</span><span>Permissões por perfil</span><span>PIN validado localmente</span></div>
      </section>`;

    const pin = gate.querySelector('#gatePin');
    const login = gate.querySelector('#gateLogin');
    const error = gate.querySelector('#gateError');
    const doLogin = async () => {
      if (!login || !pin) return;
      try {
        login.disabled = true;
        login.textContent = 'Validando...';
        const userId = gate.querySelector('#gateOperator')?.value || '';
        const result = await window.thor.operatorLogin({ userId, pin: pin.value });
        state.status.operator = result.operator;
        try {
          const v = v3State();
          v.operator = result.operator;
          v.operatorPromptOpen = false;
        } catch {}
        thorOperatorGateRemove();
        render();
        showToast(`Operador ${result.operator.name} identificado.`);
      } catch (e) {
        if (error) error.textContent = friendlyError(e.message);
        pin.value = '';
        pin.focus();
      } finally {
        if (login) {
          login.disabled = false;
          login.innerHTML = 'Entrar no caixa <kbd>Enter</kbd>';
        }
      }
    };
    if (login) login.onclick = doLogin;
    if (pin) {
      pin.focus();
      pin.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doLogin();
        }
      };
    }
    const sync = gate.querySelector('#gateSync');
    if (sync) sync.onclick = async () => {
      try {
        sync.disabled = true;
        sync.textContent = 'Sincronizando...';
        await window.thor.sync();
        state.status = await window.thor.status();
        await thorOperatorGateShow('');
      } catch (e) {
        if (error) error.textContent = friendlyError(e.message);
      } finally {
        sync.disabled = false;
        sync.textContent = 'Sincronizar operadores';
      }
    };
  } finally {
    thorOperatorGateLoading = false;
  }
}

const thorOperatorOriginalRender = render;
render = function () {
  thorOperatorOriginalRender();
  if (state.status?.enrolled) queueMicrotask(() => thorOperatorGateShow());
  else thorOperatorGateRemove();
};

document.addEventListener('keydown', e => {
  if (!thorOperatorGateVisible) return;
  if (e.key === 'F2' || e.key === 'F3' || e.key === 'F4' || e.key === 'F5' || e.key === 'F6' || e.key === 'F12') {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);
