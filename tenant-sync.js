// MABROUK tenant offline queue helper.
// Import only from a company-scoped POS page. This is intentionally NOT wired
// into the legacy MABROUK TRADER'S POS pages.
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";

const DB_NAME = "mabrouk-tenant-offline-sync";
const STORE = "operations";
const FUNCTIONS_REGION = "us-central1";

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replaceAll("-", "");
  return "op" + Date.now().toString(36) + Math.random().toString(36).slice(2, 18);
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "operationId" });
        store.createIndex("companyId", "companyId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
  });
}

async function queueTransaction(mode, work) {
  const db = await openQueueDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = work(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Offline queue transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Offline queue transaction was cancelled."));
    });
  } finally { db.close(); }
}

export function createTenantSync({ companyId, branchId = "", terminalId, label = "POS terminal", device = navigator.userAgent, onStatus = () => {} }) {
  if (!companyId || !terminalId) throw new Error("Company ID and terminal ID are required.");
  const functions = getFunctions(undefined, FUNCTIONS_REGION);
  const heartbeatCall = httpsCallable(functions, "registerSyncTerminal");
  const submitCall = httpsCallable(functions, "submitOfflineSyncBatch");
  let stopped = false;
  let running = false;
  let timer = null;

  async function pendingItems() {
    const db = await openQueueDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).index("companyId").getAll(companyId);
        request.onsuccess = () => resolve((request.result || []).filter(x => x.terminalId === terminalId));
        request.onerror = () => reject(request.error || new Error("Could not read offline queue."));
      });
    } finally { db.close(); }
  }

  async function pendingCount() { return (await pendingItems()).length; }

  async function enqueue({ entityType, entityId, payload, baseVersion = "" }) {
    if (!["sale", "inventory", "customer", "stockMovement"].includes(entityType)) {
      throw new Error("Unsupported offline operation type.");
    }
    if (!entityId || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("A record ID and object payload are required.");
    }
    const item = {
      operationId: makeId(), companyId, branchId, terminalId,
      entityType, entityId: String(entityId), baseVersion: String(baseVersion || ""),
      payload, queuedAt: new Date().toISOString()
    };
    await queueTransaction("readwrite", store => store.add(item));
    const count = await pendingCount();
    onStatus({ state: navigator.onLine ? "queued" : "offline", pendingCount: count });
    if (navigator.onLine) flush().catch(error => onStatus({ state: "waiting", pendingCount: count, error: error.message }));
    return item.operationId;
  }

  async function heartbeat() {
    if (stopped || !navigator.onLine) return;
    const count = await pendingCount();
    await heartbeatCall({ companyId, branchId, terminalId, label, device: String(device).slice(0, 120), page: "POS", pendingCount: count });
    onStatus({ state: "online", pendingCount: count });
  }

  async function flush() {
    if (stopped || running || !navigator.onLine) return { uploaded: 0 };
    running = true;
    try {
      let uploaded = 0;
      while (!stopped && navigator.onLine) {
        const items = (await pendingItems()).slice(0, 50);
        if (!items.length) break;
        const response = await submitCall({
          companyId, branchId, terminalId,
          operations: items.map(({ operationId, entityType, entityId, baseVersion, payload }) =>
            ({ operationId, entityType, entityId, baseVersion, payload }))
        });
        // The server confirms that every item was either stored, already stored
        // identically, or preserved as a two-version conflict before local delete.
        const acceptedTotal = Number(response.data?.accepted || 0) +
          Number(response.data?.duplicates || 0) + Number(response.data?.conflicts || 0);
        if (acceptedTotal !== items.length) throw new Error("Server did not confirm every queued operation; local copies were kept.");
        await queueTransaction("readwrite", store => items.forEach(item => store.delete(item.operationId)));
        uploaded += items.length;
        onStatus({ state: "uploaded", pendingCount: await pendingCount(), result: response.data });
      }
      await heartbeat().catch(() => {});
      return { uploaded, pendingCount: await pendingCount() };
    } catch (error) {
      onStatus({ state: "waiting", pendingCount: await pendingCount(), error: error.message || String(error) });
      throw error;
    } finally { running = false; }
  }

  async function tick() {
    if (stopped || !navigator.onLine) {
      onStatus({ state: "offline", pendingCount: await pendingCount().catch(() => 0) });
      return;
    }
    try { await flush(); await heartbeat(); }
    catch (error) { onStatus({ state: "waiting", error: error.message || String(error) }); }
  }

  const onlineHandler = () => tick();
  window.addEventListener("online", onlineHandler);
  tick();
  timer = setInterval(tick, 30000);

  return {
    enqueue,
    flush,
    pendingCount,
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("online", onlineHandler);
    }
  };
}
