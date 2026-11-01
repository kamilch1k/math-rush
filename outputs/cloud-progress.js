(function (global) {
  'use strict';

  const progress = global.MathRushProgress;
  if (!progress) return;
  const META_PREFIX = 'mathRushCloudV1:';
  const BACKUP_PREFIX = 'mathRushCloudBackupsV1:';
  let session = null;
  let generation = 0;
  let suppressSave = false;
  let guestSnapshot = null;
  let guestMessage = '';

  function emit(name, detail) {
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new global.CustomEvent(name, { detail }));
    }
  }

  function status() {
    if (!session) return { state: 'guest', connected: false, userId: null, dirty: false, revision: 0, message: guestMessage };
    return {
      state: session.state, connected: true, userId: session.userId,
      dirty: session.dirty, revision: session.revision, message: session.message || '',
      conflict: Boolean(session.conflict), remoteRevision: session.conflict?.revision,
      recovering: Boolean(session.recovering)
    };
  }

  function notify() { emit('mathrush:cloud', status()); }
  function isCurrent(candidate) { return session === candidate && candidate.generation === generation; }
  function metaKey(userId) { return META_PREFIX + encodeURIComponent(userId); }
  function backupKey(userId) { return BACKUP_PREFIX + encodeURIComponent(userId); }

  function readBackups(userId) {
    try {
      const stored = JSON.parse(localStorage.getItem(backupKey(userId)) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (_) { return []; }
  }

  function exportLocal() {
    return JSON.parse(JSON.stringify({
      format: 'math-rush-device-progress', version: 1, exportedAt: new Date().toISOString(),
      userId: session?.userId || null, revision: session?.revision || 0,
      progress: progress.load(), backups: session ? readBackups(session.userId) : []
    }));
  }

  function readMeta(userId) {
    try { return JSON.parse(localStorage.getItem(metaKey(userId)) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function saveMeta(candidate) {
    const meta = { revision: candidate.revision, dirty: candidate.dirty, importedGuest: candidate.importedGuest };
    try { localStorage.setItem(metaKey(candidate.userId), JSON.stringify(meta)); }
    catch (_) { /* Account progress remains usable while this page is open. */ }
  }

  function replaceLocal(data) {
    suppressSave = true;
    try { progress.save(data || progress.emptyData()); }
    finally { suppressSave = false; }
  }

  function cancel(candidate) {
    if (!candidate) return;
    if (candidate.timer && typeof global.clearTimeout === 'function') global.clearTimeout(candidate.timer);
    if (candidate.controller) candidate.controller.abort();
  }

  function disconnect() {
    generation += 1;
    cancel(session);
    session = null;
    progress.setAccount(null);
    guestMessage = '';
    emit('mathrush:progress', { progress: progress.load(), accountId: null, source: 'account' });
    notify();
    return status();
  }

  async function request(path, options = {}, candidate) {
    const response = await global.fetch(path, {
      credentials: 'same-origin', ...options,
      ...(candidate?.controller ? { signal: candidate.controller.signal } : {})
    });
    let data = {};
    try { data = await response.json(); } catch (_) { /* Preserve the HTTP error if no JSON body exists. */ }
    return { response, data };
  }

  function schedule(candidate) {
    if (!isCurrent(candidate) || candidate.recovering || candidate.conflict || !candidate.dirty || candidate.state === 'offline' || typeof global.setTimeout !== 'function') return;
    if (candidate.timer) global.clearTimeout(candidate.timer);
    candidate.timer = global.setTimeout(() => {
      candidate.timer = null;
      if (isCurrent(candidate)) void sync();
    }, 700);
  }

  function validRemote(data) {
    return Number.isInteger(data.revision) && data.revision >= 0 &&
      (data.progress === null || (data.progress && data.progress.version === 2 && Array.isArray(data.progress.attempts)));
  }

  async function loadRemote(candidate) {
    try {
      const { response, data } = await request('/api/progress', {}, candidate);
      if (!isCurrent(candidate)) return;
      if (response.status === 401) {
        disconnect();
        guestMessage = 'Sign in again to sync your account progress.';
        notify();
        return;
      }
      if (!response.ok || !validRemote(data)) throw new Error(data.message || 'Progress sync is unavailable. Your practice is saved on this device.');
      candidate.loaded = true;
      if (candidate.dirty && data.revision !== candidate.revision) {
        candidate.conflict = { revision: data.revision };
        candidate.state = 'conflict';
        candidate.message = 'Another device has newer progress. Both copies are preserved; automatic upload is paused.';
      } else {
        if (!candidate.dirty) replaceLocal(data.progress);
        candidate.revision = data.revision;
        candidate.state = candidate.dirty ? 'pending' : 'synced';
        candidate.message = '';
      }
      saveMeta(candidate);
    } catch (error) {
      if (!isCurrent(candidate)) return;
      candidate.loaded = false;
      candidate.state = 'offline';
      candidate.message = error.message || 'Offline. Account progress is saved on this device.';
    }
    if (isCurrent(candidate)) notify();
  }

  function connect(user) {
    if (!user || user.id === null || user.id === undefined || !String(user.id)) return Promise.reject(new TypeError('An authenticated user id is required.'));
    const userId = String(user.id);
    if (session?.userId === userId) return session.connectPromise || Promise.resolve(status());
    generation += 1;
    const wasGuest = !session;
    cancel(session);
    session = null;
    if (wasGuest) {
      guestSnapshot = progress.load();
      replaceLocal(guestSnapshot);
    }
    progress.setAccount(userId);
    const meta = readMeta(userId);
    const candidate = {
      userId, generation, revision: Number.isInteger(meta.revision) && meta.revision >= 0 ? meta.revision : 0,
      dirty: Boolean(meta.dirty), importedGuest: Boolean(meta.importedGuest),
      state: 'connecting', message: '', loaded: false, changes: 0, conflict: null,
      controller: typeof global.AbortController === 'function' ? new global.AbortController() : null
    };
    session = candidate;
    emit('mathrush:progress', { progress: progress.load(), accountId: userId, source: 'account' });
    notify();
    candidate.connectPromise = (async () => {
      await loadRemote(candidate);
      if (isCurrent(candidate)) schedule(candidate);
      return status();
    })();
    return candidate.connectPromise;
  }

  async function performSync(candidate) {
    if (!candidate.loaded) await loadRemote(candidate);
    if (!isCurrent(candidate) || candidate.recovering || !candidate.loaded || candidate.conflict || !candidate.dirty) return status();
    const changes = candidate.changes;
    const snapshot = progress.load();
    candidate.state = 'syncing';
    notify();
    try {
      const { response, data } = await request('/api/progress', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: snapshot, revision: candidate.revision })
      }, candidate);
      if (!isCurrent(candidate)) return status();
      if (response.status === 401) {
        disconnect();
        guestMessage = 'Sign in again to sync your account progress.';
        notify();
        return status();
      }
      if (response.status === 409) {
        candidate.conflict = { revision: data.revision };
        candidate.state = 'conflict';
        candidate.message = 'Another device has newer progress. Both copies are preserved; automatic upload is paused.';
      } else {
        if (!response.ok || !Number.isInteger(data.revision)) throw new Error(data.message || 'Could not upload progress. Your practice is saved on this device.');
        candidate.revision = data.revision;
        candidate.dirty = candidate.changes !== changes;
        candidate.state = candidate.dirty ? 'pending' : 'synced';
        candidate.message = '';
      }
      saveMeta(candidate);
    } catch (error) {
      if (!isCurrent(candidate)) return status();
      candidate.loaded = false;
      candidate.state = 'offline';
      candidate.message = error.message || 'Offline. Account progress is saved on this device.';
    }
    if (isCurrent(candidate)) { notify(); schedule(candidate); }
    return status();
  }

  function sync() {
    const candidate = session;
    if (!candidate) return Promise.resolve(status());
    if (candidate.recoveryPromise) return candidate.recoveryPromise;
    if (candidate.syncPromise) return candidate.syncPromise;
    candidate.syncPromise = (async () => {
      await candidate.connectPromise;
      if (!isCurrent(candidate)) return status();
      return performSync(candidate);
    })().finally(() => { candidate.syncPromise = null; });
    return candidate.syncPromise;
  }

  function useCloudCopy() {
    const candidate = session;
    if (!candidate) return Promise.resolve(status());
    if (candidate.recoveryPromise) return candidate.recoveryPromise;
    candidate.recovering = true;
    if (candidate.timer && typeof global.clearTimeout === 'function') global.clearTimeout(candidate.timer);
    candidate.timer = null;
    const pendingSync = candidate.syncPromise;
    candidate.recoveryPromise = (async () => {
      await candidate.connectPromise;
      if (pendingSync) await pendingSync;
      if (!isCurrent(candidate)) return status();
      const changes = candidate.changes;
      const backup = {
        savedAt: new Date().toISOString(), revision: candidate.revision,
        progress: JSON.parse(JSON.stringify(progress.load()))
      };
      try {
        // Persist the device branch before replacing anything. Failed backups stop recovery.
        localStorage.setItem(backupKey(candidate.userId), JSON.stringify(readBackups(candidate.userId).concat(backup)));
      } catch (_) {
        candidate.message = 'Could not keep a device backup. Download the device copy and free storage before trying again.';
        notify();
        return status();
      }
      notify();
      try {
        const { response, data } = await request('/api/progress', {}, candidate);
        if (!isCurrent(candidate)) return status();
        if (response.status === 401) {
          disconnect();
          guestMessage = 'Sign in again to sync your account progress.';
          notify();
          return status();
        }
        if (!response.ok || !validRemote(data)) throw new Error(data.message || 'Could not load cloud progress. The device copy is unchanged.');
        if (candidate.changes !== changes) {
          candidate.message = 'New practice was saved while loading. Your device copy is unchanged. Try again when ready.';
          notify();
          return status();
        }
        replaceLocal(data.progress);
        candidate.revision = data.revision;
        candidate.dirty = false;
        candidate.conflict = null;
        candidate.loaded = true;
        candidate.state = 'synced';
        candidate.message = 'Cloud progress loaded. Your previous device copy is kept in the downloadable backup.';
        saveMeta(candidate);
      } catch (error) {
        if (!isCurrent(candidate)) return status();
        candidate.message = error.message || 'Could not load cloud progress. The device copy is unchanged.';
      }
      if (isCurrent(candidate)) notify();
      return status();
    })().finally(() => {
      candidate.recovering = false;
      candidate.recoveryPromise = null;
      if (isCurrent(candidate)) notify();
    }).then(() => status());
    return candidate.recoveryPromise;
  }

  function hasPractice(data) {
    return data.totalXp > 0 || data.attempts.length > 0 || Object.values(data.skills).some((item) => item.attempts > 0);
  }

  async function importGuest() {
    const candidate = session;
    if (!candidate) return status();
    await candidate.connectPromise;
    if (!isCurrent(candidate)) return status();
    if (!candidate.loaded) await loadRemote(candidate);
    if (!isCurrent(candidate)) return status();
    if (!candidate.loaded || candidate.conflict) return status();
    if (candidate.importedGuest || hasPractice(progress.load())) {
      candidate.message = 'Guest practice can be imported into an empty account only. Existing account progress was kept.';
      notify();
      return status();
    }
    if (!guestSnapshot || !hasPractice(guestSnapshot)) {
      candidate.message = 'There is no guest practice to import.';
      notify();
      return status();
    }
    candidate.importedGuest = true;
    progress.save(guestSnapshot);
    saveMeta(candidate);
    return sync();
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('mathrush:progress', (event) => {
      const candidate = session;
      if (suppressSave || !candidate || event.detail?.source === 'account' || event.detail?.accountId !== candidate.userId) return;
      candidate.dirty = true;
      candidate.changes += 1;
      if (!candidate.conflict) candidate.state = 'pending';
      saveMeta(candidate);
      notify();
      schedule(candidate);
    });
  }

  async function bootstrap() {
    const startedAt = generation;
    try {
      const { response, data } = await request('/api/me');
      if (generation !== startedAt || !response.ok) return status();
      if (data.user) return connect(data.user);
    } catch (_) { /* Guest practice remains available without the account service. */ }
    return status();
  }

  const api = { connect, disconnect, sync, importGuest, exportLocal, useCloudCopy, status };
  global.MathRushCloud = api;
  api.ready = global.location && /^https?:$/.test(global.location.protocol) && typeof global.fetch === 'function'
    ? bootstrap() : Promise.resolve(status());
})(window);
