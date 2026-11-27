export function createSettingsDataController({ db, doc, getDoc, setDoc, serverTimestamp, notify, setStatus, isSessionReady }) {
  const read = async key => {
    const snapshot = await getDoc(doc(db, "settings", key));
    return snapshot.exists() ? snapshot.data() : {};
  };
  const put = async (key, data, button) => {
    if (!isSessionReady()) {
      notify("Please wait until your sign-in session is checked.", "info");
      return false;
    }
    const original = button?.textContent || "Save";
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    try {
      await setDoc(doc(db, "settings", key), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      notify("Saved successfully. Existing POS records were not changed.", "good");
      return true;
    } catch (error) {
      console.error("Settings save failed:", key, error);
      const detail = error?.code === "permission-denied"
        ? "Firestore denied this save. Check the signed-in account and Firestore rules."
        : (error?.message || "Unknown Firebase error.");
      notify("Could not save " + key + " settings. " + detail + " No business records were deleted.", "bad");
      return false;
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  };
  const fill = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
  };
  async function loadAll() {
    const jobs = [
      ["business", data => {
        fill("bizName", data.name); fill("bizPhone", data.phone); fill("bizEmail", data.email);
        fill("bizLocation", data.location); fill("bizAddress", data.address);
      }],
      ["pos", data => {
        fill("currency", data.currency || "KES"); fill("till", data.till || "TILL 1");
        fill("receiptTitle", data.receiptTitle || "MABROUK TRADER'S");
        fill("footerText", data.footerText || "Thank you");
        document.getElementById("showLogo").checked = data.showLogo !== false;
        document.getElementById("showCustomer").checked = data.showCustomer !== false;
      }],
      ["system", data => {
        fill("theme", data.theme || "red"); fill("language", data.language || "English");
      }]
    ];
    const results = await Promise.allSettled(jobs.map(async ([key, apply]) => apply(await read(key))));
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [jobs[index][0] + ": " + (result.reason?.code || result.reason?.message || "read denied")] : []);
    if (failures.length) {
      setStatus("Firebase connected · some settings unavailable", "bad");
      notify("Some preferences could not be loaded: " + failures.join(" | ") + ". Existing records are safe.", "bad");
      return false;
    }
    setStatus("Firebase connected · preferences loaded", "ok");
    return true;
  }
  return {
    loadAll,
    saveBusiness: button => put("business", {
      name: document.getElementById("bizName").value.trim(),
      phone: document.getElementById("bizPhone").value.trim(),
      email: document.getElementById("bizEmail").value.trim(),
      location: document.getElementById("bizLocation").value.trim(),
      address: document.getElementById("bizAddress").value.trim()
    }, button),
    savePos: button => put("pos", {
      currency: document.getElementById("currency").value.trim().toUpperCase() || "KES",
      till: document.getElementById("till").value.trim(),
      receiptTitle: document.getElementById("receiptTitle").value.trim(),
      footerText: document.getElementById("footerText").value.trim(),
      showLogo: document.getElementById("showLogo").checked,
      showCustomer: document.getElementById("showCustomer").checked
    }, button),
    saveSystem: button => put("system", {
      theme: document.getElementById("theme").value,
      language: document.getElementById("language").value
    }, button)
  };
}
