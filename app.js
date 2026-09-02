import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const cfg = window.JYNVElo_FIREBASE || {};
const ready = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let app, auth, db, storage;
if (ready) {
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

const UK = "jv_users";
const SK = "jv_session";
const VK = "jv_videos";

function read(k, fb) {
  try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? fb : v; }
  catch { return fb; }
}
function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function localUser() { return read(SK, null); }
function setLocalUser(u) { write(SK, u); window.JV.user = u; }

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("jynvelo", 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("files")) r.result.createObjectStore("files"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function putBlob(id, blob) {
  const dbx = await openDb();
  return new Promise((res, rej) => {
    const tx = dbx.transaction("files", "readwrite");
    tx.objectStore("files").put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function getBlobUrl(id) {
  const dbx = await openDb();
  return new Promise((res, rej) => {
    const tx = dbx.transaction("files", "readonly");
    const q = tx.objectStore("files").get(id);
    q.onsuccess = () => res(q.result ? URL.createObjectURL(q.result) : null);
    q.onerror = () => rej(q.error);
  });
}

window.JV = {
  ready,
  user: ready ? null : localUser(),
  parseTags(raw) {
    return String(raw || "").split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim().toLowerCase()).filter(Boolean);
  },
  formatTags(tags) {
    return (tags || []).map((t) => "#" + String(t).replace(/^#+/, "")).join(" ");
  },
  onUser(fn) {
    if (ready) {
      onAuthStateChanged(auth, (u) => { window.JV.user = u; fn(u); });
      return;
    }
    fn(localUser());
  },
  async signup(email, pass, name) {
    email = String(email || "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid email.");
    if (String(pass || "").length < 6) throw new Error("Password must be at least 6 characters.");
    if (ready) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });
      try { await sendEmailVerification(cred.user); } catch (_) {}
      return cred.user;
    }
    const users = read(UK, []);
    if (users.some((u) => u.email === email)) throw new Error("This email is already registered. Log in.");
    const user = { uid: "l" + Date.now(), email, pass: String(pass), displayName: String(name || email.split("@")[0]) };
    users.push(user);
    write(UK, users);
    setLocalUser({ uid: user.uid, email: user.email, displayName: user.displayName });
    return window.JV.user;
  },
  async login(email, pass) {
    email = String(email || "").trim().toLowerCase();
    if (ready) {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      return cred.user;
    }
    const found = read(UK, []).find((u) => u.email === email && u.pass === String(pass));
    if (!found) throw new Error("Wrong email or password.");
    setLocalUser({ uid: found.uid, email: found.email, displayName: found.displayName });
    return window.JV.user;
  },
  async reset(email) {
    if (ready) { await sendPasswordResetEmail(auth, email); return; }
    throw new Error("Password reset email needs Firebase. Use the password you created on this phone.");
  },
  async logout() {
    if (ready && auth) await signOut(auth);
    localStorage.removeItem(SK);
    window.JV.user = null;
    location.reload();
  },
  async listVideos() {
    if (ready) {
      const qy = query(collection(db, "videos"), orderBy("created", "desc"));
      const snap = await getDocs(qy);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const list = read(VK, []);
    for (const v of list) {
      if (v.fileId && !v.src) v.src = await getBlobUrl(v.fileId);
    }
    return list;
  },
  async publish({ title, tags, file, url }) {
    const u = ready ? auth && auth.currentUser : localUser();
    if (!u) throw new Error("Login required");
    let src = String(url || "").trim();
    let fileId = "";
    if (file) {
      if (ready) {
        const path = "videos/" + u.uid + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
        const r = ref(storage, path);
        await uploadBytes(r, file);
        src = await getDownloadURL(r);
      } else {
        fileId = "f" + Date.now();
        await putBlob(fileId, file);
        src = URL.createObjectURL(file);
      }
    }
    if (!src && !fileId) throw new Error("Choose a file or paste an MP4 URL");
    const item = {
      title: title || "Untitled",
      tags: window.JV.parseTags(tags),
      src,
      fileId,
      user: u.displayName || (u.email || "").split("@")[0],
      uid: u.uid,
      views: 0,
      created: Date.now()
    };
    if (ready) {
      await addDoc(collection(db, "videos"), { ...item, created: serverTimestamp() });
      return;
    }
    const list = read(VK, []);
    item.id = "v" + Date.now();
    list.unshift(item);
    write(VK, list);
  }
};
