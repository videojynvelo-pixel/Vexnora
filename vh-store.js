/* VideoHub local demo store: accounts + uploads + IndexedDB files */
(function (w) {
  const USERS_KEY = "vh_users";
  const SESSION_KEY = "vh_user";
  const UP_KEY = "vh_uploads";
  const OTP_KEY = "vh_otp";
  const DB_NAME = "videohub";
  const DB_STORE = "files";

  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function getSession() {
    return read(SESSION_KEY, null);
  }
  function setSession(user) {
    write(SESSION_KEY, user);
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }
  function listUsers() {
    return read(USERS_KEY, []);
  }
  function saveUsers(list) {
    write(USERS_KEY, list);
  }

  function signup({ username, email, pass }) {
    username = String(username || "").trim();
    email = String(email || "").trim().toLowerCase();
    pass = String(pass || "");
    if (username.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
    if (!email.includes("@")) return { ok: false, error: "Enter a valid email." };
    if (pass.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    const users = listUsers();
    if (users.some((u) => u.email === email || u.name.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: "Username or email already exists." };
    }
    const user = { name: username, email, pass, created: Date.now() };
    users.push(user);
    saveUsers(users);
    setSession({ name: user.name, email: user.email, at: Date.now() });
    return { ok: true, user: getSession() };
  }

  function makeOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function requestOtp(email) {
    email = String(email || "").trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      return { ok: false, error: "Enter a valid email." };
    }
    const users = listUsers();
    if (users.some((u) => u.email === email)) {
      return { ok: false, error: "This email is already registered. Log in instead." };
    }
    const code = makeOtp();
    write(OTP_KEY, {
      email,
      code,
      exp: Date.now() + 10 * 60 * 1000,
      tries: 0,
      verified: false
    });
    return { ok: true, email, code, expiresMin: 10 };
  }

  function verifyOtp(email, code) {
    email = String(email || "").trim().toLowerCase();
    code = String(code || "").trim();
    const rec = read(OTP_KEY, null);
    if (!rec || rec.email !== email) return { ok: false, error: "Request a new OTP first." };
    if (Date.now() > rec.exp) return { ok: false, error: "OTP expired. Send again." };
    if (rec.tries >= 5) return { ok: false, error: "Too many tries. Send a new OTP." };
    rec.tries += 1;
    write(OTP_KEY, rec);
    if (rec.code !== code) return { ok: false, error: "Wrong OTP." };
    rec.verified = true;
    write(OTP_KEY, rec);
    return { ok: true };
  }

  function signupVerified({ username, email, pass }) {
    const rec = read(OTP_KEY, null);
    email = String(email || "").trim().toLowerCase();
    if (!rec || rec.email !== email || !rec.verified) {
      return { ok: false, error: "Verify email OTP first." };
    }
    const res = signup({ username, email, pass });
    if (res.ok) localStorage.removeItem(OTP_KEY);
    return res;
  }

  function login({ user, pass }) {
    const ident = String(user || "").trim().toLowerCase();
    const password = String(pass || "");
    const found = listUsers().find(
      (u) => u.email === ident || u.name.toLowerCase() === ident
    );
    if (!found || found.pass !== password) {
      return { ok: false, error: "Wrong username/email or password." };
    }
    setSession({ name: found.name, email: found.email, at: Date.now() });
    return { ok: true, user: getSession() };
  }

  function listUploads() {
    return read(UP_KEY, []);
  }
  function saveUploads(list) {
    write(UP_KEY, list);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putFile(id, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getFile(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteFile(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  const urlCache = {};
  async function fileUrl(id) {
    if (urlCache[id]) return urlCache[id];
    const blob = await getFile(id);
    if (!blob) return null;
    urlCache[id] = URL.createObjectURL(blob);
    return urlCache[id];
  }

  async function addUpload(meta, file) {
    const id = "u" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    if (file) await putFile(id, file);
    const item = {
      id,
      title: meta.title,
      user: meta.user,
      views: 0,
      dur: meta.dur || 0,
      hd: !!meta.hd,
      age: 0,
      tags: meta.tags || ["indian"],
      extra: ["user"],
      thumb: meta.thumb || "",
      src: meta.src || "",
      hasFile: !!file,
      created: Date.now()
    };
    const list = listUploads();
    list.unshift(item);
    saveUploads(list);
    return item;
  }

  async function removeUpload(id, username) {
    const list = listUploads();
    const item = list.find((x) => x.id === id);
    if (!item || item.user !== username) return false;
    saveUploads(list.filter((x) => x.id !== id));
    if (item.hasFile) await deleteFile(id);
    return true;
  }

  w.VH = {
    getSession,
    setSession,
    clearSession,
    signup,
    signupVerified,
    requestOtp,
    verifyOtp,
    login,
    listUploads,
    addUpload,
    removeUpload,
    fileUrl
  };
})(window);
