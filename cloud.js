/**
 * SalonPro - Conexión con la nube (Firebase Auth + Firestore)
 *
 * Los datos viven en Firestore, bajo la cuenta de cada usuario:
 *   users/{uid}/products/{id}
 *   users/{uid}/purchases/{id}
 *   users/{uid}/jobs/{id}
 *   users/{uid}/expenses/{id}
 *   users/{uid}/settings/main
 *
 * app.js sigue trabajando con un único objeto "data". Este módulo compara ese
 * objeto con lo último que hay en la nube y sube solo lo que cambió.
 * Firestore guarda además una copia en el teléfono para poder trabajar sin
 * internet; cuando vuelve la conexión, los cambios se suben solos.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyChKy5SnpaK5k2GJ27OuLD9oQDAnGpYKM8",
  authDomain: "salon-laura.firebaseapp.com",
  projectId: "salon-laura",
  storageBucket: "salon-laura.firebasestorage.app",
  messagingSenderId: "592645830902",
  appId: "1:592645830902:web:3e1cbcda2770e2b2b254d7"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

let db;
try {
  // Copia local para funcionar sin internet (y compartida entre pestañas)
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('No se pudo activar la caché sin conexión, se usa Firestore normal:', e);
  db = getFirestore(firebaseApp);
}

const COLS = ['products', 'purchases', 'jobs', 'expenses'];

let uid = null;
let unsubs = [];
// Lo último que sabemos que está en la nube: { products: Map(id -> {s, t}), ..., settings: string|null }
let shadow = emptyShadow();

function emptyShadow() {
  return {
    products: new Map(),
    purchases: new Map(),
    jobs: new Map(),
    expenses: new Map(),
    settings: null
  };
}

// Texto estable de un objeto (claves ordenadas) para comparar sin falsos cambios
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// Copia limpia (Firestore no acepta valores "undefined")
function clean(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function unsubscribe() {
  unsubs.forEach(fn => { try { fn(); } catch (e) { /* nada */ } });
  unsubs = [];
}

/**
 * Escucha en vivo los datos del usuario que inició sesión.
 * handler.onData(data, { allServer, empty }) se llama cada vez que algo cambia:
 *   allServer -> true cuando todo ya fue confirmado por el servidor (no solo por la copia local)
 *   empty     -> true si la cuenta todavía no tiene ningún dato
 */
function subscribe(handler) {
  unsubscribe();
  const user = auth.currentUser;
  if (!user) return;
  uid = user.uid;
  shadow = emptyShadow();

  const state = { products: null, purchases: null, jobs: null, expenses: null, settings: undefined };
  const server = {};

  const emit = () => {
    if (COLS.some(c => state[c] === null) || state.settings === undefined) return;
    const allServer = [...COLS, 'settings'].every(k => server[k] === true);
    const empty = COLS.every(c => state[c].length === 0) && state.settings === null;
    handler.onData({
      products: state.products,
      purchases: state.purchases,
      jobs: state.jobs,
      expenses: state.expenses,
      settings: state.settings
    }, { allServer, empty });
  };

  COLS.forEach(name => {
    const unsub = onSnapshot(
      collection(db, 'users', uid, name),
      snap => {
        const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        // Productos: en el orden en que se crearon. Lo demás: lo más nuevo primero.
        const dir = name === 'products' ? 1 : -1;
        items.sort((a, b) => dir * ((a._t || 0) - (b._t || 0)));
        state[name] = items;
        server[name] = !snap.metadata.fromCache;
        shadow[name] = new Map(items.map(it => [it.id, { s: stable(clean(it)), t: it._t }]));
        emit();
      },
      err => handler.onError && handler.onError(err)
    );
    unsubs.push(unsub);
  });

  unsubs.push(onSnapshot(
    doc(db, 'users', uid, 'settings', 'main'),
    snap => {
      state.settings = snap.exists() ? snap.data() : null;
      server.settings = !snap.metadata.fromCache;
      shadow.settings = state.settings ? stable(clean(state.settings)) : null;
      emit();
    },
    err => handler.onError && handler.onError(err)
  ));
}

/**
 * Sube a la nube solo lo que cambió respecto a lo último conocido.
 * Devuelve una promesa que se cumple cuando el servidor confirma los cambios
 * (sin internet queda esperando y se completa sola al volver la conexión).
 */
async function sync(data) {
  if (!uid) return;
  const now0 = Date.now();
  const ops = [];

  COLS.forEach(name => {
    const arr = data[name] || [];
    const prev = shadow[name];
    const seen = new Set();

    arr.forEach((item, k) => {
      if (!item || !item.id) return;
      // Marca de orden: se conserva la que ya tenía; si es nuevo, se le asigna una
      if (item._t == null) {
        const p = prev.get(item.id);
        item._t = p && p.t != null ? p.t : (name === 'products' ? now0 + k : now0 - k);
      }
      const payload = clean(item);
      const s = stable(payload);
      seen.add(item.id);
      const p = prev.get(item.id);
      if (!p || p.s !== s) {
        ops.push({ ref: doc(db, 'users', uid, name, item.id), data: payload });
        prev.set(item.id, { s, t: item._t });
      }
    });

    for (const id of Array.from(prev.keys())) {
      if (!seen.has(id)) {
        ops.push({ ref: doc(db, 'users', uid, name, id), del: true });
        prev.delete(id);
      }
    }
  });

  const settingsPayload = clean(data.settings || {});
  const settingsStr = stable(settingsPayload);
  if (settingsStr !== shadow.settings) {
    ops.push({ ref: doc(db, 'users', uid, 'settings', 'main'), data: settingsPayload });
    shadow.settings = settingsStr;
  }

  if (ops.length === 0) return;

  const commits = [];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => {
      if (op.del) batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    });
    commits.push(batch.commit());
  }
  await Promise.all(commits);
}

window.SalonCloud = {
  onAuthChanged: cb => onAuthStateChanged(auth, cb),
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signUp: (email, password) => createUserWithEmailAndPassword(auth, email, password),
  signOut: () => {
    unsubscribe();
    uid = null;
    shadow = emptyShadow();
    return signOut(auth);
  },
  resetPassword: email => sendPasswordResetEmail(auth, email),
  subscribe,
  unsubscribe,
  sync,
  get currentEmail() {
    return auth.currentUser ? auth.currentUser.email : null;
  },
  get currentUid() {
    return uid;
  }
};
