// ClearNote shared.js v2.0
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
   Cloudinary
   ============================================================ */
const CLOUDINARY_CLOUD_NAME = "nopxs3zt";
const CLOUDINARY_UPLOAD_PRESET = "clearnote_unsigned";

const LIMITS = { avatar: 10 * 1024 * 1024, post: 10 * 1024 * 1024, pdf: 10 * 1024 * 1024 };

export async function uploadToCloudinary(file, type = 'post') {
  if (!file) throw new Error('لم يتم اختيار ملف');
  const maxSize = LIMITS[type] || LIMITS.post;
  if (file.size > maxSize) {
    const mb = (maxSize / 1024 / 1024).toFixed(0);
    throw new Error(`حجم الملف كبير جداً (الحد الأقصى ${mb} ميجابايت)`);
  }
  let resourceType = 'image';
  if (file.type === 'application/pdf') resourceType = 'raw';
  else if (file.type.startsWith('video/')) resourceType = 'video';
  else if (!file.type.startsWith('image/')) throw new Error('نوع الملف غير مدعوم — الصور و PDF فقط');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder', type === 'avatar' ? 'clearnote/avatars' : type === 'pdf' ? 'clearnote/pdfs' : 'clearnote/posts');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'فشل رفع الملف');
  }
  const data = await res.json();
  return data.secure_url;
}

export async function uploadAvatar(file) { return uploadToCloudinary(file, 'avatar'); }

/* ============================================================
   Utilities
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

// Timeout wrapper — يمنع أي استعلام من تعليق الصفحة
export async function withTimeout(promise, ms = 10000, label = '') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت المهلة: ' + label)), ms))
  ]);
}

/* ============================================================
   Auth
   ============================================================ */
export async function signUp(email, password, name, extraData = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid, email, name, ...extraData,
    followersCount: 0, followingCount: 0, postsCount: 0,
    isVerified: false, verifiedUntil: null,
    createdAt: serverTimestamp()
  });
  await createAdminNotification('new_student', 'طالب جديد',
    `${name} سجّل حساب جديد (${extraData.role === 'ta' ? 'معيد' : extraData.role === 'doctor' ? 'دكتور' : 'طالب'})`,
    'admin.html');
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() { await signOut(auth); }

export async function getUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { id: uid, ...snap.data() } : null;
  } catch (e) { console.warn('getUserData failed:', e); return null; }
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
   Device fingerprint
   ============================================================ */
export async function getDeviceFingerprint() {
  try {
    const raw = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, new Date().getTimezoneOffset()].join("|");
    const buf = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } catch (e) {
    // fallback للبيئات التي لا تدعم crypto.subtle
    const raw = navigator.userAgent + navigator.language;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
    return 'fb' + Math.abs(hash).toString(16).padStart(22, '0');
  }
}

export async function checkDeviceStatus(uid) {
  const fp = await getDeviceFingerprint();
  const devRef = doc(db, 'devices', uid, 'list', fp);
  try {
    const devSnap = await getDoc(devRef);
    if (devSnap.exists()) {
      await updateDoc(devRef, { lastSeen: serverTimestamp() }).catch(() => {});
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
      await createAdminNotification('new_device', 'طلب جهاز جديد',
        `${userData?.name || 'طالب'} يحاول الدخول من جهاز جديد`, 'admin.html');
    }
    return { status: newStatus, fp };
  } catch (e) {
    console.warn('checkDeviceStatus failed:', e);
    // fail-open: نسمح بالدخول حتى لو تعذر التحقق
    return { status: 'approved', fp };
  }
}

/* ============================================================
   Subscriptions
   ============================================================ */
export async function requestSubscription(uid, userName, subjectId, subjectName, notes) {
  const reqRef = doc(collection(db, 'subscription_requests'));
  await setDoc(reqRef, {
    id: reqRef.id, uid, userName, subjectId, subjectName, notes,
    status: 'pending', createdAt: serverTimestamp()
  });
  await createAdminNotification(
    'new_subscription_request', 'طلب اشتراك جديد',
    `${userName} يطلب الاشتراك في "${subjectName}"`,
    'admin.html',
    { reqId: reqRef.id, uid, kind: 'subscription' }
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
   Follow
   ============================================================ */
export async function followUser(myUid, targetUid) {
  if (myUid === targetUid) throw new Error('لا يمكن متابعة نفسك');
  const followRef = doc(db, 'follows', `${myUid}_${targetUid}`);
  await setDoc(followRef, { followerUid: myUid, followedUid: targetUid, createdAt: serverTimestamp() });
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
  try {
    const snap = await getDoc(doc(db, 'follows', `${myUid}_${targetUid}`));
    return snap.exists();
  } catch (e) { return false; }
}

/* ============================================================
   Verification — بدون composite index
   ============================================================ */
export async function requestVerification(uid, userName, role, type, plan, price, durationDays, notes) {
  // فحص آمن بدون composite index
  try {
    const snap = await getDocs(query(collection(db, 'verification_requests'), where('uid', '==', uid)));
    if (snap.docs.some(d => d.data().status === 'pending')) {
      throw new Error('لديك طلب توثيق قيد المراجعة بالفعل');
    }
  } catch (e) {
    if (e.message.includes('قيد المراجعة')) throw e;
    // إذا فشل الفحص، نكمل (لأن السبب قد يكون شبكة، لا نمنع المستخدم)
    console.warn('pre-check verification failed:', e);
  }

  const ref = doc(collection(db, 'verification_requests'));
  await setDoc(ref, {
    id: ref.id, uid, userName, role, type, plan, price, durationDays, notes,
    status: 'pending', createdAt: serverTimestamp()
  });

  const roleLabel = role === 'ta' ? 'معيد' : role === 'doctor' ? 'دكتور' : 'طالب';
  const typeLabel = type === 'free' ? 'توثيق مجاني' : `توثيق مدفوع - ${plan} - ${price}ج`;
  await createAdminNotification(
    'new_verification_request',
    type === 'free' ? 'طلب توثيق مجاني' : 'طلب توثيق مدفوع',
    `${userName} (${roleLabel}) - ${typeLabel}`,
    'admin.html',
    { reqId: ref.id, uid, kind: 'verification' }
  );
  return ref.id;
}

export async function activateVerification(uid, durationDays) {
  const updates = { isVerified: true, verifiedAt: serverTimestamp() };
  if (durationDays > 0) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    updates.verifiedUntil = expiresAt;
  } else {
    updates.verifiedUntil = null;
  }
  await updateDoc(doc(db, 'users', uid), updates);
}

export async function rejectVerification(reqId, uid, reason = '') {
  await updateDoc(doc(db, 'verification_requests', reqId), {
    status: 'rejected', rejectReason: reason, reviewedAt: serverTimestamp()
  });
  await createNotification(uid, 'verification_rejected', '❌ تم رفض طلب التوثيق',
    reason || 'تواصل مع الإدارة للاستفسار', 'profile.html');
}

export async function checkPendingVerification(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'verification_requests'), where('uid', '==', uid)));
    return snap.docs.some(d => d.data().status === 'pending');
  } catch (e) {
    console.warn('checkPendingVerification failed:', e);
    return false;
  }
}

/* ============================================================
   Notifications
   ============================================================ */
export async function createNotification(uid, type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'notifications', uid, 'items'));
  await setDoc(ref, { id: ref.id, type, title, message, link, meta, read: false, createdAt: serverTimestamp() });
  return ref.id;
}

export async function createAdminNotification(type, title, message, link = '', meta = {}) {
  const ref = doc(collection(db, 'admin_notifications'));
  await setDoc(ref, { id: ref.id, type, title, message, link, meta, read: false, createdAt: serverTimestamp() });
  return ref.id;
}

export function listenUserNotifications(uid, callback) {
  const q = query(collection(db, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q,
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn('notif listener error:', err); callback([]); }
  );
}

export function listenAdminNotifications(callback) {
  const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'), limit(80));
  return onSnapshot(q,
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn('admin notif listener error:', err); callback([]); }
  );
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
  notifs.forEach(n => { if (!n.read) { batch.update(doc(db, 'notifications', uid, 'items', n.id), { read: true }); changed = true; } });
  if (changed) await batch.commit();
}
export async function markAllAdminNotificationsRead(notifs) {
  const batch = writeBatch(db);
  let changed = false;
  notifs.forEach(n => { if (!n.read) { batch.update(doc(db, 'admin_notifications', n.id), { read: true }); changed = true; } });
  if (changed) await batch.commit();
}
export async function deleteNotification(uid, notifId) {
  await deleteDoc(doc(db, 'notifications', uid, 'items', notifId));
}
export async function deleteAdminNotification(notifId) {
  await deleteDoc(doc(db, 'admin_notifications', notifId));
}

/* ============================================================
   Real-time listeners — مع error callbacks
   ============================================================ */
export function listenUserSubscriptions(uid, callback) {
  const q = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  return onSnapshot(q,
    (snap) => {
      const subs = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'active' && data.expiresAt) {
          try {
            const exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            if (exp > new Date()) subs[data.subjectId] = data;
          } catch (e) { }
        }
      });
      callback(subs);
    },
    (err) => { console.warn('subs listener error:', err); callback({}); }
  );
}

export function listenUserDevices(uid, callback) {
  return onSnapshot(collection(db, 'devices', uid, 'list'),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn('devices listener error:', err); callback([]); }
  );
}
