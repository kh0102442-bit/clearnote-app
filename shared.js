import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, addDoc, query, where, orderBy, limit, onSnapshot, writeBatch, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

/* ============================================================
   Cloudinary — إعدادات الرفع
   ============================================================ */
const CLOUDINARY_CLOUD_NAME = "nopxs3zt";
const CLOUDINARY_UPLOAD_PRESET = "clearnote_unsigned";

/* حدود الملفات */
const LIMITS = {
  avatar: 10 * 1024 * 1024,   // 10MB
  post:   10 * 1024 * 1024,   // 10MB
  pdf:    10 * 1024 * 1024,   // 10MB
};

/**
 * رفع ملف إلى Cloudinary وإرجاع الرابط المباشر.
 * @param {File} file - الملف المطلوب رفعه
 * @param {string} type - 'avatar' | 'post' | 'pdf'
 * @returns {Promise<string>} secure_url
 */
export async function uploadToCloudinary(file, type = 'post') {
  if (!file) throw new Error('لم يتم اختيار ملف');

  const maxSize = LIMITS[type] || LIMITS.post;
  if (file.size > maxSize) {
    const mb = (maxSize / 1024 / 1024).toFixed(0);
    throw new Error(`حجم الملف كبير جداً (الحد الأقصى ${mb} ميجابايت)`);
  }

  // تحديد الـ resource_type حسب نوع الملف
  let resourceType = 'image';
  if (file.type === 'application/pdf') resourceType = 'raw';
  else if (file.type.startsWith('video/')) resourceType = 'video';
  else if (!file.type.startsWith('image/')) {
    throw new Error('نوع الملف غير مدعوم — الصور و PDF فقط');
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder', type === 'avatar' ? 'clearnote/avatars' : type === 'pdf' ? 'clearnote/pdfs' : 'clearnote/posts');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: fd
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'فشل رفع الملف');
  }

  const data = await res.json();
  return data.secure_url;
}

/**
 * رفع صورة شخصية وإرجاع الرابط.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadAvatar(file) {
  return uploadToCloudinary(file, 'avatar');
}

/* ============================================================
   أدوات مساعدة
   ============================================================ */
export function showToast(msg, type = "success") {
  const toast = document.createElement("div");
  toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${type === "error" ? "#b91c1c" : "#1f6b45"};color:white;padding:14px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:bold;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90%;text-align:center;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

export function escapeHtml(t) {
  if (!t) return '';
  return String(t).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ============================================================
   المصادقة والمستخدمين
   ============================================================ */
export async function signUp(email, password, name, extraData = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid, email, name, ...extraData,
    followersCount: 0, followingCount: 0, postsCount: 0,
    createdAt: serverTimestamp()
  });
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

/* ============================================================
   بصمة الجهاز
   ============================================================ */
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
    deviceId: fp, userAgent: navigator.userAgent,
    status: newStatus, createdAt: serverTimestamp(), lastSeen: serverTimestamp()
  });

  if (!isFirstDevice) {
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

/* ============================================================
   الاشتراكات
   ============================================================ */
export async function requestSubscription(uid, userName, subjectId, subjectName, notes) {
  const reqRef = doc(collection(db, 'subscription_requests'));
  await setDoc(reqRef, {
    id: reqRef.id, uid, userName, subjectId, subjectName, notes,
    status: 'pending', createdAt: serverTimestamp()
  });
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

/* ============================================================
   المتابعة (Follow) — Collection منفصل
   ============================================================ */
export async function followUser(myUid, targetUid) {
  if (myUid === targetUid) throw new Error('لا يمكن متابعة نفسك');
  const followRef = doc(db, 'follows', `${myUid}_${targetUid}`);
  await setDoc(followRef, {
    followerUid: myUid, followedUid: targetUid, createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'users', myUid), { followingCount: increment(1) });
  await updateDoc(doc(db, 'users', targetUid), { followersCount: increment(1) });
}

export async function unfollowUser(myUid, targetUid) {
  const followRef = doc(db, 'follows', `${myUid}_${targetUid}`);
  await deleteDoc(followRef);
  await updateDoc(doc(db, 'users', myUid), { followingCount: increment(-1) });
  await updateDoc(doc(db, 'users', targetUid), { followersCount: increment(-1) });
}

export async function checkIfFollowing(myUid, targetUid) {
  const snap = await getDoc(doc(db, 'follows', `${myUid}_${targetUid}`));
  return snap.exists();
}

/* ============================================================
   الإشعارات
   ============================================================ */
export async function createNotification(uid, type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'notifications', uid, 'items'));
  await setDoc(ref, {
    id: ref.id, type, title, message, link, meta,
    read: false, createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function createAdminNotification(type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'admin_notifications'));
  await setDoc(ref, {
    id: ref.id, type, title, message, link, meta,
    read: false, createdAt: serverTimestamp()
  });
  return ref.id;
}

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

export async function markNotificationRead(uid, notifId) {
  await updateDoc(doc(db, 'notifications', uid, 'items', notifId), { read: true });
}

export async function markAdminNotificationRead(notifId) {
  await updateDoc(doc(db, 'admin_notifications', notifId), { read: true });
}

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

export async function deleteNotification(uid, notifId) {
  await deleteDoc(doc(db, 'notifications', uid, 'items', notifId));
}

export async function deleteAdminNotification(notifId) {
  await deleteDoc(doc(db, 'admin_notifications', notifId));
}

/* ============================================================
   Real-time Listeners
   ============================================================ */
export function listenUserSubscriptions(uid, callback) {
  const q = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    const subs = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.status === 'active' && data.expiresAt) {
        try {
          if (data.expiresAt.toDate() > new Date()) subs[data.subjectId] = data;
        } catch (e) { }
      }
    });
    callback(subs);
  });
}

export function listenUserDevices(uid, callback) {
  return onSnapshot(collection(db, 'devices', uid, 'list'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
