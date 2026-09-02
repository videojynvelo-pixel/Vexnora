import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const cfg = window.JYNVElo_FIREBASE || {};
const ready = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let app, auth, db, storage;
if (ready) {
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

window.JV = {
  ready,
  user: null,
  onUser(fn) {
    if (!ready) {
      fn(null);
      return;
    }
    onAuthStateChanged(auth, (u) => {
      window.JV.user = u;
      fn(u);
    });
  },
  async signup(email, pass, name) {
    if (!ready) throw new Error("Firebase keys missing in firebase-config.js");
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    return cred.user;
  },
  async login(email, pass) {
    if (!ready) throw new Error("Firebase keys missing in firebase-config.js");
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    return cred.user;
  },
  async reset(email) {
    if (!ready) throw new Error("Firebase keys missing");
    await sendPasswordResetEmail(auth, email);
  },
  async logout() {
    if (auth) await signOut(auth);
  },
  async listVideos() {
    if (!ready) return [];
    const q = query(collection(db, "videos"), orderBy("created", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  parseTags(raw) {
    return String(raw || "")
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#+/, "").trim().toLowerCase())
      .filter(Boolean);
  },
  formatTags(tags) {
    return (tags || []).map((t) => "#" + String(t).replace(/^#+/, "")).join(" ");
  },
  async publish({ title, tags, file, url }) {
    if (!ready) throw new Error("Firebase keys missing");
    if (!auth.currentUser) throw new Error("Login required");
    let src = (url || "").trim();
    let thumb = "";
    if (file) {
      const path = "videos/" + auth.currentUser.uid + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
      const r = ref(storage, path);
      await uploadBytes(r, file);
      src = await getDownloadURL(r);
    }
    if (!src) throw new Error("Choose a file or paste an MP4 URL");
    const doc = await addDoc(collection(db, "videos"), {
      title: title || "Untitled",
      tags: window.JV.parseTags(tags),
      src,
      thumb,
      user: auth.currentUser.displayName || auth.currentUser.email.split("@")[0],
      uid: auth.currentUser.uid,
      views: 0,
      created: serverTimestamp()
    });
    return doc.id;
  }
};
