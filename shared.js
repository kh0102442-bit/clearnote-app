// ClearNote shared.js v3.0
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

const CLOUDINARY_CLOUD_NAME = "nopxs3zt";
const CLOUDINARY_UPLOAD_PRESET = "clearnote_unsigned";
const LIMITS = { avatar: 10 * 1024 * 1024, post: 10 * 1024 * 1024, pdf: 10 * 1024 * 1024 };

/* ===== Privacy defaults ===== */
export const PRIVACY_FIELDS = ['bio', 'phone', 'uniEmail', 'university'];
export const PRIVACY_OPTIONS = ['public', 'followers', 'private'];
export const DEFAULT_PRIVACY = { bio: 'public', phone: 'private', uniEmail: 'private', university: 'public' };
export const FIELD_LABELS_AR = {
  name: 'الاسم', bio: 'النبذة', phone: 'رقم الهاتف', uniEmail: 'البريد الجامعي',
  university: 'الجامعة', username: 'اسم المستخدم', avatarUrl: 'الصورة الشخصية',
  nationalId: 'الرقم القومي'
};

/* ===== Cloudinary ===== */
export async function uploadToCloudinary(file, type = 'post') {
  if (!file) throw new Error('لم يتم اختيار ملف');
  const maxSize = LIMITS[type] || LIMITS.post;
  if (file.size > maxSize) throw new Error(`حجم الملف كبير (الحد ${(maxSize/1024/1024).toFixed(0)} ميجا)`);
  let rt = 'image';
  if (file.type === 'application/pdf') rt = 'raw';
  else if (file.type.startsWith('video/')) rt = 'video';
  else if (!file.type.startsWith('image/')) throw new Error('نوع غير مدعوم');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder', `clearnote/${type === 'avatar' ? 'avatars' : type === 'pdf' ? 'pdfs' : 'posts'}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${rt}/upload`, { method: 'POST', body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'فشل الرفع'); }
  return (await res.json()).secure_url;
}
export async function uploadAvatar(file) { return uploadToCloudinary(file, 'avatar'); }

/* ===== Utilities ===== */
export function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${type === "error" ? "#b91c1c" : "#1f6b45"};color:white;padding:14px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:bold;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90%;text-align:center;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
export function escapeHtml(t) {
  if (!t) return '';
  return String(t).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
export function withTimeout(promise, ms = 10000, label = '') {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('انتهت المهلة: ' + label)), ms))]);
}

/* ===== Auth ===== */
export async function signUp(email, password, name, extraData = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid, email, name, ...extraData,
    followersCount: 0, followingCount: 0, postsCount: 0,
    isVerified: false, verifiedUntil: null,
    privacy: { ...DEFAULT_PRIVACY },
    createdAt: serverTimestamp()
  });
  await createAdminNotification('new_student', 'طالب جديد', `${name} سجّل حساب (${extraData.role === 'ta' ? 'معيد' : extraData.role === 'doctor' ? 'دكتور' : 'طالب'})`, 'admin.html', { uid: cred.user.uid }).catch(() => {});
  return cred.user;
}
export async function signIn(email, password) { return (await signInWithEmailAndPassword(auth, email, password)).user; }
export async function signOutUser() { await signOut(auth); }
export async function getUserData(uid) {
  try { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { id: uid, ...s.data() } : null; }
  catch (e) { console.warn('getUserData failed:', e); return null; }
}
export function onAuth(cb) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return cb(null, null);
    cb(user, await getUserData(user.uid));
  });
}
export function isAdmin(u) { return u && u.role === 'admin'; }
export function goTo(page) { window.location.href = page; }

/* ===== Device Fingerprint — v2 (stable) ===== */
const FP_STORAGE_KEY = 'clearnote_device_fp_v2';

export async function getDeviceFingerprint() {
  // 1. localStorage أولاً — إن وُجد فهو المرجع الدائم
  try {
    let fp = localStorage.getItem(FP_STORAGE_KEY);
    if (fp && fp.length >= 20) return fp;
  } catch (e) {}

  // 2. توليد بصمة جديدة (UUID عشوائي + بصمات عتاد ثابتة للمساعدة)
  try {
    const random = crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const platform = navigator.platform || 'x';
    const cores = navigator.hardwareConcurrency || 0;
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'x').replace(/[^a-zA-Z]/g, '');
    const raw = `${random}|${platform}|${cores}|${tz}`;
    const buf = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const fp = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    try { localStorage.setItem(FP_STORAGE_KEY, fp); sessionStorage.setItem(FP_STORAGE_KEY, fp); } catch (e) {}
    return fp;
  } catch (e) {
    // Fallback
    const fb = 'fb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(FP_STORAGE_KEY, fb); } catch (e) {}
    return fb;
  }
}

export async function checkDeviceStatus(uid) {
  const fp = await getDeviceFingerprint();
  const devRef = doc(db, 'devices', uid, 'list', fp);

  try {
    const devSnap = await getDoc(devRef);
    if (devSnap.exists()) {
      await updateDoc(devRef, { lastSeen: serverTimestamp() }).catch(() => {});
      const d = devSnap.data();
      return { status: d.status, fp, isPrimary: d.isPrimary || false };
    }

    // جهاز جديد — نحسب عدد الأجهزة
    const snap = await getDocs(collection(db, 'devices', uid, 'list'));
    const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const isFirstDevice = existing.length === 0;
    const approvedCount = existing.filter(d => d.status === 'approved').length;

    // موافقة تلقائية لو: أول جهاز OR لا يوجد أي جهاز موثق (استرداد)
    const autoApprove = isFirstDevice || approvedCount === 0;
    const newStatus = autoApprove ? 'approved' : 'pending';
    const isPrimary = isFirstDevice || (approvedCount === 0);

    await setDoc(devRef, {
      deviceId: fp,
      userAgent: navigator.userAgent,
      platform: navigator.platform || '',
      status: newStatus,
      isPrimary,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });

    if (!autoApprove) {
      const userData = await getUserData(uid);
      await createAdminNotification(
        'new_device', 'طلب جهاز جديد',
        `${userData?.name || 'طالب'} يحاول الدخول من جهاز جديد`,
        'admin.html',
        { uid, deviceId: fp, kind: 'device' }
      ).catch(() => {});
    }
    return { status: newStatus, fp, isPrimary };
  } catch (e) {
    console.warn('checkDeviceStatus failed:', e);
    // fail-open: نسمح بالدخول لو تعذر التحقق
    return { status: 'approved', fp, isPrimary: false };
  }
}

/* ===== Update profile with history tracking ===== */
export async function updateUserProfile(uid, updates, editedBy = 'self') {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('المستخدم غير موجود');
  const oldData = userSnap.data();

  const batch = writeBatch(db);
  const changedFields = [];
  const historyEntries = [];

  Object.keys(updates).forEach(key => {
    const oldVal = oldData[key];
    const newVal = updates[key];
    // مقارنة JSON للتفرقة (يتعامل مع null/undefined)
    if (JSON.stringify(oldVal || '') === JSON.stringify(newVal || '')) return;
    changedFields.push(key);
    const histRef = doc(collection(db, 'users', uid, 'profile_history'));
    const entry = {
      field: key,
      fieldLabel: FIELD_LABELS_AR[key] || key,
      oldValue: oldVal ?? null,
      newValue: newVal ?? null,
      editedAt: serverTimestamp(),
      editedBy
    };
    historyEntries.push(entry);
    batch.set(histRef, entry);
  });

  if (changedFields.length === 0) return [];

  // دمج privacy بعمق لو موجود
  const finalUpdates = { ...updates, updatedAt: serverTimestamp() };
  if (updates.privacy && oldData.privacy) {
    finalUpdates.privacy = { ...oldData.privacy, ...updates.privacy };
  }

  batch.update(userRef, finalUpdates);
  await batch.commit();
  return changedFields;
}

/* ===== Get profile history ===== */
export async function getProfileHistory(uid, max = 50) {
  try {
    const q = query(collection(db, 'users', uid, 'profile_history'), orderBy('editedAt', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('getProfileHistory failed:', e);
    return [];
  }
}

/* ===== Privacy check ===== */
export function canViewField(field, targetUser, viewerUid, isFollowing) {
  if (!targetUser) return false;
  if (field === 'nationalId') return false; // دائمًا خاص
  if (targetUser.uid === viewerUid) return true;
  const priv = targetUser.privacy?.[field] || DEFAULT_PRIVACY[field] || 'public';
  if (priv === 'public') return true;
  if (priv === 'followers') return !!isFollowing;
  return false;
}

/* ===== Subscriptions ===== */
export async function requestSubscription(uid, userName, subjectId, subjectName, notes) {
  const ref = doc(collection(db, 'subscription_requests'));
  await setDoc(ref, { id: ref.id, uid, userName, subjectId, subjectName, notes, status: 'pending', createdAt: serverTimestamp() });
  await createAdminNotification('new_subscription_request', 'طلب اشتراك جديد', `${userName} يطلب الاشتراك في "${subjectName}"`, 'admin.html', { reqId: ref.id, uid, kind: 'subscription' }).catch(() => {});
  return ref.id;
}
export async function activateSubscription(uid, subjectId, durationDays = 30) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  await setDoc(doc(db, 'subscriptions', `${uid}_${subjectId}`), {
    uid, subjectId, status: 'active', createdAt: serverTimestamp(), expiresAt
  });
}

/* ===== Follow ===== */
export async function followUser(myUid, targetUid) {
  if (myUid === targetUid) throw new Error('لا يمكن متابعة نفسك');
  await setDoc(doc(db, 'follows', `${myUid}_${targetUid}`), { followerUid: myUid, followedUid: targetUid, createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'users', myUid), { followingCount: increment(1) });
  await updateDoc(doc(db, 'users', targetUid), { followersCount: increment(1) });
}
export async function unfollowUser(myUid, targetUid) {
  await deleteDoc(doc(db, 'follows', `${myUid}_${targetUid}`));
  await updateDoc(doc(db, 'users', myUid), { followingCount: increment(-1) });
  await updateDoc(doc(db, 'users', targetUid), { followersCount: increment(-1) });
}
export async function checkIfFollowing(myUid, targetUid) {
  try { return (await getDoc(doc(db, 'follows', `${myUid}_${targetUid}`))).exists(); }
  catch (e) { return false; }
}

/* ===== Verification ===== */
export async function requestVerification(uid, userName, role, type, plan, price, durationDays, notes) {
  try {
    const snap = await getDocs(query(collection(db, 'verification_requests'), where('uid', '==', uid)));
    if (snap.docs.some(d => d.data().status === 'pending')) throw new Error('لديك طلب قيد المراجعة');
  } catch (e) { if (e.message.includes('قيد المراجعة')) throw e; }
  const ref = doc(collection(db, 'verification_requests'));
  await setDoc(ref, { id: ref.id, uid, userName, role, type, plan, price, durationDays, notes, status: 'pending', createdAt: serverTimestamp() });
  const roleLabel = role === 'ta' ? 'معيد' : role === 'doctor' ? 'دكتور' : 'طالب';
  await createAdminNotification(
    'new_verification_request',
    type === 'free' ? 'طلب توثيق مجاني' : 'طلب توثيق مدفوع',
    `${userName} (${roleLabel}) - ${type === 'free' ? 'مجاني' : `${plan} - ${price}ج`}`,
    'admin.html',
    { reqId: ref.id, uid, kind: 'verification' }
  ).catch(() => {});
  return ref.id;
}
export async function activateVerification(uid, durationDays) {
  const updates = { isVerified: true, verifiedAt: serverTimestamp() };
  if (durationDays > 0) { const e = new Date(); e.setDate(e.getDate() + durationDays); updates.verifiedUntil = e; }
  else updates.verifiedUntil = null;
  await updateDoc(doc(db, 'users', uid), updates);
}
export async function rejectVerification(reqId, uid, reason = '') {
  await updateDoc(doc(db, 'verification_requests', reqId), { status: 'rejected', rejectReason: reason, reviewedAt: serverTimestamp() });
  await createNotification(uid, 'verification_rejected', '❌ تم رفض طلب التوثيق', reason || 'تواصل مع الإدارة', 'profile.html');
}
export async function checkPendingVerification(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'verification_requests'), where('uid', '==', uid)));
    return snap.docs.some(d => d.data().status === 'pending');
  } catch (e) { return false; }
}

/* ===== Notifications ===== */
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
export function listenUserNotifications(uid, cb) {
  const q = query(collection(db, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => { console.warn(e); cb([]); });
}
export function listenAdminNotifications(cb) {
  const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'), limit(80));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => { console.warn(e); cb([]); });
}
export async function markNotificationRead(uid, id) { await updateDoc(doc(db, 'notifications', uid, 'items', id), { read: true }); }
export async function markAdminNotificationRead(id) { await updateDoc(doc(db, 'admin_notifications', id), { read: true }); }
export async function markAllNotificationsRead(uid, notifs) {
  const b = writeBatch(db); let c = false;
  notifs.forEach(n => { if (!n.read) { b.update(doc(db, 'notifications', uid, 'items', n.id), { read: true }); c = true; } });
  if (c) await b.commit();
}
export async function markAllAdminNotificationsRead(notifs) {
  const b = writeBatch(db); let c = false;
  notifs.forEach(n => { if (!n.read) { b.update(doc(db, 'admin_notifications', n.id), { read: true }); c = true; } });
  if (c) await b.commit();
}
export async function deleteNotification(uid, id) { await deleteDoc(doc(db, 'notifications', uid, 'items', id)); }
export async function deleteAdminNotification(id) { await deleteDoc(doc(db, 'admin_notifications', id)); }

/* ===== Real-time listeners ===== */
export function listenUserSubscriptions(uid, cb) {
  const q = query(collection(db, 'subscriptions'), where('uid', '==', uid));
  return onSnapshot(q, snap => {
    const subs = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.status === 'active' && data.expiresAt) {
        try {
          const exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
          if (exp > new Date()) subs[data.subjectId] = data;
        } catch (e) {}
      }
    });
    cb(subs);
  }, e => { console.warn(e); cb({}); });
}
export function listenUserDevices(uid, cb) {
  return onSnapshot(collection(db, 'devices', uid, 'list'), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => { console.warn(e); cb([]); });
}
