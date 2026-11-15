import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, addDoc, query, where, orderBy, limit, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCHspBBXBG8DmLPOfKcqE8H8SmAjw5HGpQ",
  authDomain: "clearnote-aefcb.firebaseapp.com",
  projectId: "clearnote-aefcb",
  storageBucket: "clearnote-aefcb.firebasestorage.app",
  messagingSenderId: "909239922660",
  appId: "1:909239922660:web:1db0fbc92c419aa13a21f1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const ROLES = { ADMIN: "admin", STUDENT: "student", TA: "ta", DOCTOR: "doctor" };

export function showToast(msg, type = "success") {
  const toast = document.createElement("div");
  toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${type === "error" ? "#b91c1c" : "#1f6b45"};color:white;padding:14px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:bold;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90%;text-align:center;`;
  toast.textContent = msg; document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

export async function signUp(email, password, name, extraData = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), { 
    uid: cred.user.uid, email, name, ...extraData, createdAt: serverTimestamp() 
  });
  // إشعار للأدمن بوجود طالب جديد
  await createAdminNotification(
    'new_student', 
    'طالب جديد', 
    `${name} سجّل حساب جديد (${extraData.role === 'ta' ? 'معيد' : extraData.role === 'doctor' ? 'دكتور' : 'طالب'})`,
    'admin.html'
  );
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() { await signOut(auth); }

export async function getUserData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null, null);
    const userData = await getUserData(user.uid);
    callback(user, userData);
  });
}

export function isAdmin(userData) { return userData && userData.role === 'admin'; }
export function goTo(page) { window.location.href = page; }

// ===== DEVICE FINGERPRINT =====
export async function getDeviceFingerprint() {
  const raw = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, new Date().getTimezoneOffset()].join("|");
  const buf = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export async function checkDeviceStatus(uid) {
  const fp = await getDeviceFingerprint();
  const devRef = doc(db, 'devices', uid, 'list', fp);
  const devSnap = await getDoc(devRef);

  if (devSnap.exists()) {
    await updateDoc(devRef, { lastSeen: serverTimestamp() });
    return { status: devSnap.data().status, fp };
  }

  const snap = await getDocs(collection(db, 'devices', uid, 'list'));
  const isFirstDevice = snap.docs.length === 0;
  const newStatus = isFirstDevice ? 'approved' : 'pending';

  await setDoc(devRef, {
    deviceId: fp, userAgent: navigator.userAgent, status: newStatus, createdAt: serverTimestamp(), lastSeen: serverTimestamp()
  });

  if (!isFirstDevice) {
    // إشعار للأدمن بجهاز جديد
    const userData = await getUserData(uid);
    await createAdminNotification(
      'new_device',
      'طلب جهاز جديد',
      `${userData?.name || 'طالب'} يحاول الدخول من جهاز جديد`,
      'admin.html'
    );
  }

  return { status: newStatus, fp };
}

// ===== SUBSCRIPTIONS =====
export async function requestSubscription(uid, userName, subjectId, subjectName, notes) {
  const reqRef = doc(collection(db, 'subscription_requests'));
  await setDoc(reqRef, {
    id: reqRef.id, uid, userName, subjectId, subjectName, notes,
    status: 'pending', createdAt: serverTimestamp()
  });
  
  // إشعار للأدمن بطلب جديد
  await createAdminNotification(
    'new_subscription_request',
    'طلب اشتراك جديد',
    `${userName} يطلب الاشتراك في "${subjectName}"`,
    'admin.html'
  );
  
  return reqRef.id;
}

export async function activateSubscription(uid, subjectId, durationDays = 30) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  await setDoc(doc(db, 'subscriptions', `${uid}_${subjectId}`), {
    uid, subjectId, status: 'active', createdAt: serverTimestamp(), expiresAt: expiresAt
  });
}

// ===== NOTIFICATIONS =====

// إشعار لمستخدم معين
export async function createNotification(uid, type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'notifications', uid, 'items'));
  await setDoc(ref, {
    id: ref.id, type, title, message, link, meta,
    read: false, createdAt: serverTimestamp()
  });
  return ref.id;
}

// إشعار للأدمن (مجموعة مشتركة)
export async function createAdminNotification(type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'admin_notifications'));
  await setDoc(ref, {
    id: ref.id, type, title, message, link, meta,
    read: false, createdAt: serverTimestamp()
  });
  return ref.id;
}

// الاستماع لإشعارات المستخدم (Real-time)
export function listenUserNotifications(uid, callback) {
  const q = query(
    collection(db, 'notifications', uid, 'items'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('notif listener error', err));
}

// الاستماع لإشعارات الأدمن (Real-time)
export function listenAdminNotifications(callback) {
  const q = query(
    collection(db, 'admin_notifications'),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('admin notif listener error', err));
}

// تعليم إشعار كمقروء
export async function markNotificationRead(uid, notifId) {
  await updateDoc(doc(db, 'notifications', uid, 'items', notifId), { read: true });
}

export async function markAdminNotificationRead(notifId) {
  await updateDoc(doc(db, 'admin_notifications', notifId), { read: true });
}

// تعليم كل الإشعارات كمقروءة
export async function markAllNotificationsRead(uid, notifs) {
  const batch = writeBatch(db);
  let changed = false;
  notifs.forEach(n => {
    if (!n.read) {
      batch.update(doc(db, 'notifications', uid, 'items', n.id), { read: true });
      changed = true;
    }
  });
  if (changed) await batch.commit();
}

export async function markAllAdminNotificationsRead(notifs) {
  const batch = writeBatch(db);
  let changed = false;
  notifs.forEach(n => {
    if (!n.read) {
      batch.update(doc(db, 'admin_notifications', n.id), { read: true });
      changed = true;
    }
  });
  if (changed) await batch.commit();
}

// حذف إشعار
export async function deleteNotification(uid, notifId) {
  await deleteDoc(doc(db, 'notifications', uid, 'items', notifId));
}

export async function deleteAdminNotification(notifId) {
  await deleteDoc(doc(db, 'admin_notifications', notifId));
}

// ===== REAL-TIME LISTENERS =====

// الاستماع لاشتراكات المستخدم
export function listenUserSubscriptions(uid, callback) {
  const q = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    const subs = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.status === 'active' && data.expiresAt) {
        try {
          if (data.expiresAt.toDate() > new Date()) subs[data.subjectId] = data;
        } catch(e) {}
      }
    });
    callback(subs);
  });
}

// الاستماع لأجهزة المستخدم
export function listenUserDevices(uid, callback) {
  return onSnapshot(collection(db, 'devices', uid, 'list'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
