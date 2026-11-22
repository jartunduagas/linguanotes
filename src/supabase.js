// supabase.js — conexión con el backend (Supabase) y helpers de cuentas/grupos.
//
// Carga el cliente de Supabase desde un CDN SOLO cuando hace falta (login/nube), para
// no romper el modo offline: si no hay internet, la app sigue funcionando con localStorage.
//
// La clave "anon" es pública a propósito; la seguridad real está en las políticas RLS
// del backend (ver backend/02_policies.sql). NUNCA poner aquí la clave service_role.

const SUPABASE_URL = "https://spiejcbhdajyhwwogtsf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bE-_qBWtXsVG7dkvz1DY6Q_Qvhq8QVA";

let _client = null;
let _loading = null;

// Carga perezosa del SDK de Supabase (UMD) desde CDN.
function loadSdk() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Supabase (¿sin conexión?)"));
    document.head.appendChild(s);
  });
  return _loading;
}

// Devuelve el cliente de Supabase (lo crea la primera vez). Lanza si no hay red.
export async function getClient() {
  if (_client) return _client;
  await loadSdk();
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

// ¿Está configurado el backend? (siempre sí ahora; útil por si algún día se desactiva)
export function backendConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/* ============================ AUTENTICACIÓN ============================ */

export async function signUp(email, password, displayName) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || "Estudiante" },
      // al confirmar desde el correo, el alumno vuelve a la app
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Reenviar el correo de confirmación (por si no llegó el primero).
export async function resendConfirmation(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
}

// Devuelve { user, profile } o null si no hay sesión.
export async function getSession() {
  const sb = await getClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (error) {
    console.warn("No se pudo leer el perfil:", error.message);
  }
  // Si por lo que sea no llega el perfil, al menos devolvemos un perfil mínimo
  // usando el nombre de los metadatos, para que la app no quede sin datos.
  const fallback = { id: session.user.id, display_name: session.user.user_metadata?.display_name || "Estudiante", role: "generic" };
  return { user: session.user, profile: profile || fallback };
}

export async function updateDisplayName(name) {
  const sb = await getClient();
  const { error } = await sb.from("profiles").update({ display_name: name }).eq("id", (await sb.auth.getUser()).data.user.id);
  if (error) throw error;
}

/* ============================ ROLES ============================ */

export async function redeemTeacherInvite(code) {
  const sb = await getClient();
  const { data, error } = await sb.rpc("redeem_teacher_invite", { invite_code: code });
  if (error) throw error;
  return data; // 'ok' | 'invalid' | 'expired' | 'used_up'
}

/* ============================ SINCRONIZACIÓN DE NOTAS ============================ */

// Sube el estado completo del usuario (el objeto de storage) a la nube.
export async function pushPersonalData(dataObj) {
  const sb = await getClient();
  const uid = (await sb.auth.getUser()).data.user.id;
  const { error } = await sb.from("personal_data").upsert({ user_id: uid, data: dataObj, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Descarga el estado del usuario desde la nube (o null si no hay nada aún).
export async function pullPersonalData() {
  const sb = await getClient();
  const uid = (await sb.auth.getUser()).data.user.id;
  const { data, error } = await sb.from("personal_data").select("data, updated_at").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ============================ GRUPOS ============================ */

export async function createGroup(name, allowStudentWords = true) {
  const sb = await getClient();
  const { data, error } = await sb.rpc("create_group", { group_name: name, allow_student_words: allowStudentWords });
  if (error) throw error;
  return data;
}

export async function joinGroup(code) {
  const sb = await getClient();
  const { data, error } = await sb.rpc("join_group", { code });
  if (error) throw error;
  return data;
}

export async function myGroups() {
  const sb = await getClient();
  const uid = (await sb.auth.getUser()).data.user.id;
  // grupos donde soy miembro (incluye los que poseo, porque el owner se auto-inscribe)
  const { data, error } = await sb
    .from("group_members")
    .select("group_id, groups(*)")
    .eq("user_id", uid);
  if (error) throw error;
  return (data || []).map((r) => r.groups).filter(Boolean);
}

export async function closeGroup(groupId) {
  const sb = await getClient();
  const { error } = await sb.from("groups").update({ is_open: false, closed_at: new Date().toISOString() }).eq("id", groupId);
  if (error) throw error;
}

export async function deleteGroup(groupId) {
  const sb = await getClient();
  const { error } = await sb.from("groups").delete().eq("id", groupId);
  if (error) throw error;
}

export async function groupMembers(groupId) {
  const sb = await getClient();
  const { data, error } = await sb.from("group_members").select("user_id, profiles(display_name)").eq("group_id", groupId);
  if (error) throw error;
  return data || [];
}

/* ============================ PALABRAS DE GRUPO ============================ */

export async function groupWords(groupId) {
  const sb = await getClient();
  const { data, error } = await sb.from("group_words").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addGroupWord(groupId, word) {
  const sb = await getClient();
  const uid = (await sb.auth.getUser()).data.user.id;
  const { error } = await sb.from("group_words").insert({
    group_id: groupId,
    added_by: uid,
    term: word.term,
    en: word.en || "",
    es: word.es || "",
    is_verb: !!word.isVerb,
    is_noun: !!word.isNoun,
    gender: word.gender || "",
    prepositions: word.prepositions || [],
    notes: word.notes || "",
  });
  if (error) throw error;
}

/* ============================ QUIZ EN VIVO ============================ */

export async function startQuiz(groupId, modes) {
  const sb = await getClient();
  const { data, error } = await sb.from("quiz_sessions").insert({ group_id: groupId, modes }).select().single();
  if (error) throw error;
  return data;
}

export async function finishQuiz(sessionId) {
  const sb = await getClient();
  const { error } = await sb.from("quiz_sessions").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw error;
}

export async function submitQuizAnswer(sessionId, isCorrect) {
  const sb = await getClient();
  const uid = (await sb.auth.getUser()).data.user.id;
  const { error } = await sb.from("quiz_answers").insert({ session_id: sessionId, user_id: uid, is_correct: isCorrect });
  if (error) throw error;
}

export async function quizRanking(sessionId) {
  const sb = await getClient();
  const { data, error } = await sb.rpc("quiz_ranking", { sid: sessionId });
  if (error) throw error;
  return data || [];
}

// Escucha en tiempo real cuando el profesor lanza un quiz nuevo en un grupo.
export async function onNewQuiz(groupId, callback) {
  const sb = await getClient();
  const channel = sb
    .channel(`quiz-${groupId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "quiz_sessions", filter: `group_id=eq.${groupId}` }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
  return () => sb.removeChannel(channel);
}
