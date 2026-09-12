const HX = Object.freeze({
  SHEETS: { GUESTS: 'CADASTRO', CONFIG: 'CONFIG', USERS: 'USUARIOS_APP', CHECKIN: 'CHECKIN_LOG', LOG: 'LOG_SISTEMA' },
  PROPS: { SPREADSHEET: 'HX_SPREADSHEET_ID', ORIGIN: 'HX_FRONTEND_ORIGIN', SESSION_SECRET: 'HX_SESSION_SECRET', PASSWORD_PEPPER: 'HX_PASSWORD_PEPPER' },
  SESSION_HOURS: { guest: 12, admin: 8 },
  PROFILES: ['ADM_APP', 'GESTOR_APP']
});

function doGet(e) {
  if (!e || e.parameter.bridge !== '1') return HtmlService.createHtmlOutput('Héxis RSVP');
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.allowedOrigin = PropertiesService.getScriptProperties().getProperty(HX.PROPS.ORIGIN) || 'https://example.invalid';
  return template.evaluate()
    .setTitle('Héxis — conexão segura')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function configurarProjeto() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Execute esta função a partir do projeto vinculado à planilha.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty(HX.PROPS.SPREADSHEET, active.getId());
  if (!props.getProperty(HX.PROPS.SESSION_SECRET)) props.setProperty(HX.PROPS.SESSION_SECRET, Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty(HX.PROPS.PASSWORD_PEPPER)) props.setProperty(HX.PROPS.PASSWORD_PEPPER, Utilities.getUuid() + Utilities.getUuid());
  return { ok: true, spreadsheetId: active.getId() };
}

function definirOrigemFrontend(origin) {
  const clean = String(origin || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(clean)) throw new Error('Informe somente a origem HTTPS, sem caminho.');
  PropertiesService.getScriptProperties().setProperty(HX.PROPS.ORIGIN, clean);
  return { ok: true, origin: clean };
}

function definirCredencialInicial(perfil, login, senha) {
  perfil = String(perfil || '').trim().toUpperCase();
  if (HX.PROFILES.indexOf(perfil) < 0) throw new Error('Perfil inválido.');
  validateCredential_(login, senha);
  const table = table_(HX.SHEETS.USERS);
  const matches = table.rows.filter(function (row) { return row.PERFIL === perfil && row.ATIVO === 'SIM'; });
  if (matches.length !== 1) throw new Error('Deve existir exatamente um usuário ativo com o perfil ' + perfil + '.');
  const user = matches[0];
  setCells_(table.sheet, user._row, table.map, { LOGIN: normalizeLogin_(login), SENHA_HASH: hashPassword_(senha), SESSAO_REVOGADA_EM: now_() });
  logSystem_({ id: 'SETUP', name: 'Configuração inicial' }, 'CREDENCIAL_INICIAL', 'USUARIO', user.ID_USUARIO, {}, { perfil: perfil });
  return { ok: true, nome: user.NOME, perfil: perfil };
}

function rpc(raw) {
  try {
    const request = JSON.parse(raw || '{}');
    const action = String(request.action || '');
    const payload = request.payload || {};
    const routes = {
      bootstrap: function () { return bootstrap_(); },
      identify: function () { return identify_(payload); },
      guestState: function () { return guestState_(request.session); },
      respondRsvp: function () { return respondRsvp_(request.session, payload); },
      adminLogin: function () { return adminLogin_(payload); },
      dashboard: function () { return dashboard_(request.session); },
      listGuests: function () { return listGuests_(request.session); },
      setPhone: function () { return setPhone_(request.session, payload); },
      saveGuest: function () { return saveGuest_(request.session, payload); },
      saveUser: function () { return saveUser_(request.session, payload); },
      scanQr: function () { return scanQr_(request.session, payload); },
      confirmCheckin: function () { return confirmCheckin_(request.session, payload); }
    };
    if (!routes[action]) throw new Error('Ação não reconhecida.');
    return routes[action]();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    throw new Error(publicError_(error));
  }
}

function bootstrap_() {
  const c = config_();
  return {
    name: c.NOME_SISTEMA || 'Aniversário Natii Neri',
    message: c.TEXTO_CONVITE || 'Você faz parte desta comemoração.',
    date: c.EVENTO_DATA || '', time: c.EVENTO_HORA || '', place: c.EVENTO_LOCAL || '', address: c.EVENTO_ENDERECO || '',
    rsvpDeadline: c.DATA_LIMITE_RSVP || '',
    maintenance: normalizeYesNo_(c.MODO_MANUTENCAO) === 'SIM',
    maintenanceMessage: c.MENSAGEM_MANUTENCAO || 'Sistema em manutenção.',
    version: c.VERSAO_ATUAL || 'V 1.0'
  };
}

function identify_(payload) {
  rateLimit_('identify:' + hash_(String(payload.clientId || 'anon')), 20, 600);
  const phone = normalizePhone_(payload.phone);
  if (phone.length < 10) throw new Error('Informe um WhatsApp válido, com DDD.');
  const table = table_(HX.SHEETS.GUESTS);
  const matches = table.rows.filter(function (row) {
    if (row.ATIVO !== 'SIM') return false;
    return normalizePhone_(row.WHATSAPP_NORMALIZADO || row.WHATSAPP) === phone;
  });
  if (!matches.length) throw new Error('Telefone não localizado. Confira o número ou fale com a organização.');
  matches.forEach(function (row) {
    if (row.WHATSAPP_NORMALIZADO !== phone) setCells_(table.sheet, row._row, table.map, { WHATSAPP_NORMALIZADO: phone });
  });
  const ids = matches.map(function (row) { return row.ID_CONVIDADO; });
  const session = issueSession_({ type: 'guest', ids: ids, phoneHash: hash_(phone) }, HX.SESSION_HOURS.guest);
  return { session: session, invites: matches.map(publicInvite_) };
}

function guestState_(token) {
  const session = requireSession_(token, 'guest');
  const allowed = session.ids || [];
  const rows = table_(HX.SHEETS.GUESTS).rows.filter(function (row) { return allowed.indexOf(row.ID_CONVIDADO) >= 0 && row.ATIVO === 'SIM'; });
  return { invites: rows.map(publicInvite_) };
}

function respondRsvp_(token, payload) {
  const session = requireSession_(token, 'guest');
  const id = String(payload.id || '');
  const status = String(payload.status || '').toUpperCase();
  if ((session.ids || []).indexOf(id) < 0) throw new Error('Este convite não pertence à sessão atual.');
  if (['CONFIRMADO', 'RECUSADO'].indexOf(status) < 0) throw new Error('Resposta inválida.');
  enforceRsvpDeadline_();
  const table = table_(HX.SHEETS.GUESTS);
  const row = findBy_(table.rows, 'ID_CONVIDADO', id);
  if (!row || row.ATIVO !== 'SIM') throw new Error('Convite indisponível.');
  setCells_(table.sheet, row._row, table.map, { PRESENCA: status, DATA_RESPOSTA: now_(), QR_GERADO: status === 'CONFIRMADO' ? 'SIM' : 'NÃO' });
  logSystem_({ id: 'CONVIDADO', name: displayName_(row) }, 'RESPOSTA_RSVP', 'CONVIDADO', id, { status: row.PRESENCA }, { status: status });
  return guestState_(token);
}

function adminLogin_(payload) {
  const login = normalizeLogin_(payload.login);
  rateLimit_('login:' + hash_(login + ':' + String(payload.clientId || 'anon')), 8, 900);
  const table = table_(HX.SHEETS.USERS);
  const user = table.rows.filter(function (row) { return normalizeLogin_(row.LOGIN) === login && row.ATIVO === 'SIM'; })[0];
  if (!user || !user.SENHA_HASH || !verifyPassword_(String(payload.password || ''), user.SENHA_HASH)) throw new Error('Login ou senha inválidos.');
  if (HX.PROFILES.indexOf(user.PERFIL) < 0) throw new Error('Perfil sem permissão.');
  setCells_(table.sheet, user._row, table.map, { ULTIMO_ACESSO: now_() });
  const session = issueSession_({ type: 'admin', uid: user.ID_USUARIO, profile: user.PERFIL }, HX.SESSION_HOURS.admin);
  return { session: session, user: { id: user.ID_USUARIO, name: user.NOME, profile: user.PERFIL } };
}

function dashboard_(token) {
  const auth = requireAdmin_(token);
  return { user: auth.publicUser, stats: dashboardStats_() };
}

function listGuests_(token) {
  requireAdmin_(token);
  const guests = table_(HX.SHEETS.GUESTS).rows.filter(function (row) { return row.ATIVO === 'SIM'; }).map(function (row) {
    return { id: row.ID_CONVIDADO, name: displayName_(row), phone: String(row.WHATSAPP || ''), adult: row.MAIORIDADE || '', companions: row.NOME_ACOMP || '', people: peopleCount_(row), status: row.PRESENCA || 'PENDENTE', checkin: row.CHECKIN || 'PENDENTE' };
  });
  return { guests: guests };
}

function setPhone_(token, payload) {
  const auth = requireAdmin_(token);
  const phone = normalizePhone_(payload.phone);
  if (phone.length < 10) throw new Error('Informe um telefone válido, com DDD.');
  const table = table_(HX.SHEETS.GUESTS);
  const row = findBy_(table.rows, 'ID_CONVIDADO', String(payload.id || ''));
  if (!row) throw new Error('Convidado não localizado.');
  if (auth.user.PERFIL === 'ADM_APP' && normalizePhone_(row.WHATSAPP)) throw new Error('ADM pode preencher telefone ausente, mas não substituir um número existente.');
  const before = { whatsapp: row.WHATSAPP || '' };
  setCells_(table.sheet, row._row, table.map, { WHATSAPP: phone, WHATSAPP_NORMALIZADO: phone });
  logSystem_(auth.actor, 'ALTERAR_TELEFONE', 'CONVIDADO', row.ID_CONVIDADO, before, { whatsapp: phone });
  return { ok: true };
}

function saveGuest_(token, payload) {
  const auth = requireAdmin_(token, 'GESTOR_APP');
  const table = table_(HX.SHEETS.GUESTS);
  const data = payload.guest || {};
  const id = String(data.id || '');
  const existing = id ? findBy_(table.rows, 'ID_CONVIDADO', id) : null;
  const values = {
    DADOS_ENTRADA: cleanText_(data.entryLabel, 120), NOME: cleanText_(data.name, 120), WHATSAPP: normalizePhone_(data.phone),
    WHATSAPP_NORMALIZADO: normalizePhone_(data.phone), MAIORIDADE: normalizeYesNo_(data.adult), QTD_ACOMP: safeInt_(data.companionsCount, 0, 20),
    NOME_ACOMP: cleanText_(data.companions, 500), ATIVO: normalizeYesNo_(data.active || 'SIM')
  };
  if (!values.NOME && !values.DADOS_ENTRADA) throw new Error('Informe o nome ou a identificação do convidado.');
  if (existing) {
    setCells_(table.sheet, existing._row, table.map, values);
    logSystem_(auth.actor, 'ALTERAR_CONVIDADO', 'CONVIDADO', id, auditGuest_(existing), values);
    return { id: id };
  }
  values.ID_CONVIDADO = 'CNV-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  values.TOKEN_QR = Utilities.getUuid(); values.PRESENCA = 'PENDENTE'; values.QR_GERADO = 'NÃO'; values.CHECKIN = 'PENDENTE'; values.STATUS_APP = 'CONVIDADO';
  appendMapped_(table, values);
  logSystem_(auth.actor, 'CRIAR_CONVIDADO', 'CONVIDADO', values.ID_CONVIDADO, {}, values);
  return { id: values.ID_CONVIDADO };
}

function saveUser_(token, payload) {
  const auth = requireAdmin_(token, 'GESTOR_APP');
  const data = payload.user || {};
  const profile = String(data.profile || '').toUpperCase();
  if (HX.PROFILES.indexOf(profile) < 0) throw new Error('Perfil inválido.');
  validateCredential_(data.login, data.password || 'temporaria-ignorada');
  const table = table_(HX.SHEETS.USERS);
  const existing = data.id ? findBy_(table.rows, 'ID_USUARIO', String(data.id)) : null;
  const values = { NOME: cleanText_(data.name, 120), LOGIN: normalizeLogin_(data.login), PERFIL: profile, ATIVO: normalizeYesNo_(data.active || 'SIM'), ID_CONVIDADO: String(data.guestId || '') };
  if (data.password) values.SENHA_HASH = hashPassword_(data.password);
  if (existing) {
    values.SESSAO_REVOGADA_EM = now_();
    setCells_(table.sheet, existing._row, table.map, values);
    logSystem_(auth.actor, 'ALTERAR_USUARIO', 'USUARIO', existing.ID_USUARIO, { perfil: existing.PERFIL, ativo: existing.ATIVO }, { perfil: profile, ativo: values.ATIVO });
    return { id: existing.ID_USUARIO };
  }
  if (!data.password) throw new Error('Informe uma senha inicial.');
  values.ID_USUARIO = 'USR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); values.DATA_CRIACAO = now_();
  appendMapped_(table, values);
  logSystem_(auth.actor, 'CRIAR_USUARIO', 'USUARIO', values.ID_USUARIO, {}, { perfil: profile, ativo: values.ATIVO });
  return { id: values.ID_USUARIO };
}

function scanQr_(token, payload) {
  requireAdmin_(token);
  const qr = cleanToken_(payload.token);
  const row = findBy_(table_(HX.SHEETS.GUESTS).rows, 'TOKEN_QR', qr);
  if (!row || row.ATIVO !== 'SIM') throw new Error('QR Code inválido.');
  if (row.PRESENCA !== 'CONFIRMADO') throw new Error('Este convite não está confirmado.');
  return { id: row.ID_CONVIDADO, name: displayName_(row), people: peopleCount_(row), companions: row.NOME_ACOMP || '', used: row.CHECKIN === 'ENTROU', checkinAt: row.DATA_CHECKIN || '', checkinBy: row.CHECKIN_POR || '' };
}

function confirmCheckin_(token, payload) {
  const auth = requireAdmin_(token);
  const qr = cleanToken_(payload.token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const table = table_(HX.SHEETS.GUESTS);
    const row = findBy_(table.rows, 'TOKEN_QR', qr);
    if (!row || row.ATIVO !== 'SIM') { checkinLog_(null, qr, auth.actor, 'QR_INVALIDO'); throw new Error('QR Code inválido.'); }
    if (row.PRESENCA !== 'CONFIRMADO') { checkinLog_(row, qr, auth.actor, 'NAO_CONFIRMADO'); throw new Error('Convite sem confirmação de presença.'); }
    if (row.CHECKIN === 'ENTROU') { checkinLog_(row, qr, auth.actor, 'QR_JA_UTILIZADO'); throw new Error('Este ingresso já foi utilizado.'); }
    const timestamp = now_();
    setCells_(table.sheet, row._row, table.map, { CHECKIN: 'ENTROU', DATA_CHECKIN: timestamp, CHECKIN_POR: auth.user.NOME });
    checkinLog_(row, qr, auth.actor, 'ENTRADA_CONFIRMADA');
    logSystem_(auth.actor, 'CHECKIN', 'CONVIDADO', row.ID_CONVIDADO, { checkin: row.CHECKIN }, { checkin: 'ENTROU', data: timestamp });
    return { ok: true, guest: { id: row.ID_CONVIDADO, name: displayName_(row), people: peopleCount_(row) }, stats: dashboardStats_() };
  } finally { lock.releaseLock(); }
}

function requireAdmin_(token, requiredProfile) {
  const session = requireSession_(token, 'admin');
  const table = table_(HX.SHEETS.USERS);
  const user = findBy_(table.rows, 'ID_USUARIO', session.uid);
  if (!user || user.ATIVO !== 'SIM' || HX.PROFILES.indexOf(user.PERFIL) < 0) throw new Error('Acesso administrativo revogado.');
  const revokedAt = Date.parse(user.SESSAO_REVOGADA_EM || '') || 0;
  if (revokedAt && session.iat * 1000 <= revokedAt) throw new Error('Sessão revogada. Entre novamente.');
  if (requiredProfile && user.PERFIL !== requiredProfile) throw new Error('Seu perfil não possui permissão para esta ação.');
  return { user: user, actor: { id: user.ID_USUARIO, name: user.NOME }, publicUser: { id: user.ID_USUARIO, name: user.NOME, profile: user.PERFIL } };
}

function dashboardStats_() {
  const rows = table_(HX.SHEETS.GUESTS).rows.filter(function (row) { return row.ATIVO === 'SIM'; });
  const stats = { invites: rows.length, totalPeople: 0, pending: 0, confirmedInvites: 0, confirmedPeople: 0, declinedInvites: 0, declinedPeople: 0, checkedInInvites: 0, checkedInPeople: 0 };
  rows.forEach(function (row) {
    const people = peopleCount_(row); stats.totalPeople += people;
    if (row.PRESENCA === 'CONFIRMADO') { stats.confirmedInvites++; stats.confirmedPeople += people; }
    else if (row.PRESENCA === 'RECUSADO') { stats.declinedInvites++; stats.declinedPeople += people; }
    else stats.pending++;
    if (row.CHECKIN === 'ENTROU') { stats.checkedInInvites++; stats.checkedInPeople += people; }
  });
  return stats;
}

function publicInvite_(row) {
  return { id: row.ID_CONVIDADO, name: displayName_(row), people: peopleCount_(row), companions: row.NOME_ACOMP || '', status: row.PRESENCA || 'PENDENTE', qrToken: row.PRESENCA === 'CONFIRMADO' ? row.TOKEN_QR : '', checkedIn: row.CHECKIN === 'ENTROU' };
}

function table_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Estrutura ausente: ' + name + '.');
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('Aba sem cabeçalho: ' + name + '.');
  const keys = values[0].map(headerKey_); const map = {};
  keys.forEach(function (key, index) { if (key) map[key] = index + 1; });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (!values[r].some(function (value) { return value !== ''; })) continue;
    const item = { _row: r + 1 };
    keys.forEach(function (key, index) { if (key) item[key] = values[r][index]; });
    rows.push(item);
  }
  return { sheet: sheet, map: map, keys: keys, rows: rows };
}

function setCells_(sheet, rowNumber, map, values) {
  Object.keys(values).forEach(function (key) {
    const column = map[key];
    if (!column) throw new Error('Coluna obrigatória ausente: ' + key + '.');
    sheet.getRange(rowNumber, column).setValue(values[key]);
  });
}

function appendMapped_(table, values) {
  const row = new Array(table.keys.length).fill('');
  Object.keys(values).forEach(function (key) {
    if (!table.map[key]) throw new Error('Coluna obrigatória ausente: ' + key + '.');
    row[table.map[key] - 1] = values[key];
  });
  table.sheet.appendRow(row);
}

function config_() {
  const table = table_(HX.SHEETS.CONFIG); const result = {};
  table.rows.forEach(function (row) { if (row.CHAVE) result[String(row.CHAVE).trim()] = row.VALOR; });
  return result;
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(HX.PROPS.SPREADSHEET);
  if (!id) throw new Error('Projeto ainda não configurado.');
  return SpreadsheetApp.openById(id);
}

function issueSession_(claims, hours) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.assign({}, claims, { iat: now, exp: now + hours * 3600, nonce: Utilities.getUuid() });
  const encoded = base64Url_(JSON.stringify(payload));
  return encoded + '.' + sign_(encoded);
}

function requireSession_(token, type) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !safeEqual_(parts[1], sign_(parts[0]))) throw new Error('Sessão inválida. Entre novamente.');
  let payload;
  try { payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (_) { throw new Error('Sessão inválida. Entre novamente.'); }
  if (payload.type !== type || Number(payload.exp) < Math.floor(Date.now() / 1000)) throw new Error('Sessão expirada. Entre novamente.');
  return payload;
}

function sign_(value) {
  const secret = PropertiesService.getScriptProperties().getProperty(HX.PROPS.SESSION_SECRET);
  if (!secret) throw new Error('Projeto ainda não configurado.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret)).replace(/=+$/, '');
}

function hashPassword_(password) {
  const salt = Utilities.getUuid();
  return 'v1$' + salt + '$' + passwordDigest_(password, salt);
}

function verifyPassword_(password, stored) {
  const parts = String(stored || '').split('$');
  return parts.length === 3 && parts[0] === 'v1' && safeEqual_(parts[2], passwordDigest_(password, parts[1]));
}

function passwordDigest_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty(HX.PROPS.PASSWORD_PEPPER);
  if (!pepper) throw new Error('Projeto ainda não configurado.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(salt + '|' + String(password), pepper)).replace(/=+$/, '');
}

function rateLimit_(key, limit, seconds) {
  const cache = CacheService.getScriptCache(); const safeKey = 'rl:' + hash_(key).slice(0, 40);
  const count = Number(cache.get(safeKey) || 0) + 1;
  cache.put(safeKey, String(count), seconds);
  if (count > limit) throw new Error('Muitas tentativas. Aguarde alguns minutos.');
}

function checkinLog_(row, token, actor, result) {
  const table = table_(HX.SHEETS.CHECKIN);
  appendMapped_(table, { ID_LOG: 'CHK-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(), DATA_HORA: now_(), ID_CONVIDADO: row ? row.ID_CONVIDADO : '', NOME: row ? displayName_(row) : '', TOKEN_HASH: hash_(token), OPERADOR_ID: actor.id, OPERADOR_NOME: actor.name, RESULTADO: result, QTD_PESSOAS: row ? peopleCount_(row) : 0 });
}

function logSystem_(actor, action, entity, id, before, after) {
  const table = table_(HX.SHEETS.LOG);
  appendMapped_(table, { ID_LOG: 'LOG-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(), DATA_HORA: now_(), OPERADOR_ID: actor.id, OPERADOR_NOME: actor.name, ACAO: action, ENTIDADE: entity, ID_ENTIDADE: id, ANTES_JSON: JSON.stringify(before || {}), DEPOIS_JSON: JSON.stringify(after || {}) });
}

function enforceRsvpDeadline_() {
  const raw = config_().DATA_LIMITE_RSVP;
  if (!raw) return;
  const deadline = Date.parse(raw);
  if (!isNaN(deadline) && Date.now() > deadline) throw new Error('O prazo de confirmação foi encerrado. Fale com a organização.');
}

function validateCredential_(login, password) {
  if (!/^[a-z0-9._-]{3,40}$/i.test(String(login || '').trim())) throw new Error('Login deve ter de 3 a 40 caracteres válidos.');
  if (String(password || '').length < 10) throw new Error('A senha deve ter ao menos 10 caracteres.');
}

function headerKey_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function normalizePhone_(value) { let digits = String(value || '').replace(/\D/g, ''); if (digits.length === 13 && digits.slice(0, 2) === '55') digits = digits.slice(2); return digits; }
function normalizeLogin_(value) { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function normalizeYesNo_(value) { return String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'SIM' ? 'SIM' : 'NÃO'; }
function displayName_(row) { return String(row.NOME || row.DADOS_ENTRADA || 'Convidado').trim(); }
function peopleCount_(row) { return 1 + safeInt_(row.QTD_ACOMP, 0, 20); }
function safeInt_(value, min, max) { const number = parseInt(value, 10); return isNaN(number) ? min : Math.max(min, Math.min(max, number)); }
function cleanText_(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function cleanToken_(value) { const token = String(value || '').trim().replace(/^HX1:/i, ''); if (!/^[a-f0-9-]{30,60}$/i.test(token)) throw new Error('QR Code inválido.'); return token; }
function findBy_(rows, key, value) { return rows.filter(function (row) { return String(row[key] || '') === String(value || ''); })[0] || null; }
function auditGuest_(row) { return { nome: displayName_(row), whatsapp: row.WHATSAPP || '', presenca: row.PRESENCA || '', ativo: row.ATIVO || '' }; }
function now_() { return Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function base64Url_(value) { return Utilities.base64EncodeWebSafe(value).replace(/=+$/, ''); }
function hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8).map(function (byte) { const v = byte < 0 ? byte + 256 : byte; return ('0' + v.toString(16)).slice(-2); }).join(''); }
function safeEqual_(a, b) { a = String(a || ''); b = String(b || ''); let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; }
function publicError_(error) { const message = String(error && error.message ? error.message : 'Erro interno.'); return message.indexOf('Exception:') === 0 ? 'Não foi possível concluir a operação.' : message; }
