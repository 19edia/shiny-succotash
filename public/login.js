
'use strict';
const form = document.getElementById('login-form');
const password = document.getElementById('password');
const toggle = document.getElementById('toggle');
const submit = document.getElementById('submit');
const feedback = document.getElementById('feedback');
// Ativar somente quando a API descrita abaixo estiver implementada no mesmo domínio.
const AUTH_API_READY = true;
toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Ocultar' : 'Mostrar';
  toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  toggle.setAttribute('aria-pressed', String(show));
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.textContent = '';
  if (!AUTH_API_READY) {
    feedback.textContent = 'Tela pronta para integração. O servidor de autenticação ainda não foi conectado; nenhum login foi enviado.';
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Verificando acesso…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: form.elements.username.value.trim(), password: password.value}),
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) throw new Error('Usuário ou senha inválidos.');
    if (response.status === 429) throw new Error('Muitas tentativas. Aguarde antes de tentar novamente.');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Não foi possível acessar o serviço de login.');
    const data = await response.json();
    if (data.authenticated !== true) throw new Error('Não foi possível confirmar a sessão.');
    password.value = '';
    window.location.assign('/painel');
  } catch (error) {
    feedback.textContent = error.name === 'AbortError' ? 'O servidor demorou a responder. Tente novamente.' : error instanceof TypeError ? 'Falha de conexão. Tente novamente.' : error.message;
  } finally {
    clearTimeout(timeout);
    submit.disabled = false;
    submit.textContent = 'Entrar no painel →';
  }
});
