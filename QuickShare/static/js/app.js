/* ================================================================
   QuickShare — client-side logic (vanilla JavaScript, no frameworks)
   ----------------------------------------------------------------
   Every fetch() below is an HTTP request from this CLIENT (the browser)
   to the Flask SERVER. The server replies with JSON, which we render.
   That request/response exchange travels over TCP/IP on the LAN.
   ================================================================ */

// All API calls are made to the SAME origin (relative URLs), so QuickShare
// works no matter which IP/host the page was opened from on the network.
const API = {
  shareText: "/api/share/text",
  shareFile: "/api/share/file",
  retrieve: "/api/retrieve",
};

/* ---------- small helpers ---------- */
const $ = (sel) => document.querySelector(sel);

function toast(message, type = "") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = "toast show " + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = "toast " + type), 2800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS contexts.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + " " + units[i];
}

function loading(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.classList.add("is-loading"); btn.disabled = true; }
  else { if (btn.dataset.label) btn.innerHTML = btn.dataset.label; btn.classList.remove("is-loading"); btn.disabled = false; }
}

/* ================================================================
   SHARE PAGE
   ================================================================ */
function initSharePage() {
  const tabs = document.querySelectorAll(".tab");
  const panelText = $("#panel-text");
  const panelFile = $("#panel-file");
  if (!panelText || !panelFile) return;

  // ----- tab switching -----
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isText = tab.dataset.tab === "text";
      panelText.classList.toggle("hidden", !isText);
      panelFile.classList.toggle("hidden", isText);
      hideResult();
    });
  });

  // ----- text character counter -----
  const textInput = $("#text-input");
  const charCount = $("#char-count");
  textInput.addEventListener("input", () => {
    charCount.textContent = `${textInput.value.length.toLocaleString()} characters`;
  });

  // ----- share TEXT -----
  $("#btn-share-text").addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text) { toast("Please enter some text first.", "error"); return; }
    const btn = $("#btn-share-text");
    loading(btn, true);
    try {
      // HTTP POST -> server stores text and returns a 6-digit code (JSON).
      const res = await fetch(API.shareText, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      showResult(data, "Text shared! Use the code on the other device.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      loading(btn, false);
    }
  });

  // ----- file selection + drag & drop -----
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  const dzSelected = $("#dz-selected");
  const shareFileBtn = $("#btn-share-file");
  let selectedFile = null;

  function setFile(file) {
    selectedFile = file || null;
    if (selectedFile) {
      $("#dz-file-name").textContent = selectedFile.name;
      $("#dz-file-size").textContent = humanSize(selectedFile.size);
      dzSelected.classList.remove("hidden");
      shareFileBtn.disabled = false;
    } else {
      dzSelected.classList.add("hidden");
      shareFileBtn.disabled = true;
    }
  }

  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("drag"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) { fileInput.files = e.dataTransfer.files; setFile(file); }
  });

  // ----- share FILE (with upload progress) -----
  shareFileBtn.addEventListener("click", () => {
    if (!selectedFile) { toast("Please choose a file first.", "error"); return; }

    const progress = $("#upload-progress");
    const bar = $("#upload-bar");
    progress.classList.remove("hidden");
    bar.style.width = "0%";
    loading(shareFileBtn, true);

    // XMLHttpRequest is used (instead of fetch) so we can show upload progress.
    const form = new FormData();
    form.append("file", selectedFile);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API.shareFile);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + "%";
    };
    xhr.onload = () => {
      loading(shareFileBtn, false);
      progress.classList.add("hidden");
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        showResult(data, "File uploaded! Use the code on the other device.");
      } else {
        toast(data.error || `Upload failed (HTTP ${xhr.status}).`, "error");
      }
    };
    xhr.onerror = () => { loading(shareFileBtn, false); progress.classList.add("hidden"); toast("Network error during upload.", "error"); };
    xhr.send(form);
  });

  // ----- result rendering -----
  const result = $("#result");
  const codeDisplay = $("#code-display");
  const resultMeta = $("#result-meta");
  const resultExpiry = $("#result-expiry");
  let countdownTimer = null;

  function showResult(data, msg) {
    codeDisplay.textContent = data.code;
    resultMeta.textContent = data.type === "file"
      ? `${data.filename} · ${data.filesize_human}`
      : "Text ready to retrieve";
    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(msg, "success");
    startCountdown(data.expires_at);
  }

  function startCountdown(expiresAt) {
    clearInterval(countdownTimer);
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        resultExpiry.textContent = "This code has expired.";
        resultExpiry.classList.add("warn");
        clearInterval(countdownTimer);
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      resultExpiry.textContent = `Expires in ${m}:${String(s).padStart(2, "0")}`;
      resultExpiry.classList.toggle("warn", left < 60000);
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function hideResult() {
    result.classList.add("hidden");
    clearInterval(countdownTimer);
  }

  // ----- copy code -----
  $("#btn-copy").addEventListener("click", async () => {
    const ok = await copyText(codeDisplay.textContent);
    toast(ok ? "Code copied to clipboard!" : "Could not copy — copy it manually.", ok ? "success" : "error");
  });

  // ----- share another -----
  $("#btn-new-share").addEventListener("click", () => {
    hideResult();
    textInput.value = "";
    charCount.textContent = "0 characters";
    setFile(null);
    fileInput.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ================================================================
   RETRIEVE PAGE
   ================================================================ */
function initRetrievePage() {
  const codeInput = $("#code-input");
  const retrieveBtn = $("#btn-retrieve");
  if (!codeInput || !retrieveBtn) return;

  const textResult = $("#text-result");
  const fileResult = $("#file-result");
  const errorResult = $("#error-result");

  // keep the input to digits only
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doRetrieve(); });

  function hideAll() {
    textResult.classList.add("hidden");
    fileResult.classList.add("hidden");
    errorResult.classList.add("hidden");
  }

  function showError(msg) {
    hideAll();
    $("#error-text").textContent = msg;
    errorResult.classList.remove("hidden");
    errorResult.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function doRetrieve() {
    const code = codeInput.value.trim();
    if (code.length !== 6) { toast("Enter the full 6-digit code.", "error"); return; }
    loading(retrieveBtn, true);
    try {
      // HTTP POST with the code -> server looks it up and replies with JSON.
      const res = await fetch(API.retrieve, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || "Could not retrieve this code."); return; }

      hideAll();
      if (data.type === "text") {
        $("#retrieved-text").textContent = data.content;
        textResult.classList.remove("hidden");
        textResult.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("Text retrieved!", "success");
      } else {
        $("#file-name").textContent = data.filename;
        $("#file-size").textContent = data.filesize_human;
        // Download link points at the server route that streams the file.
        $("#btn-download").setAttribute("href", data.download_url);
        fileResult.classList.remove("hidden");
        fileResult.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("File found! Tap download.", "success");
      }
    } catch (err) {
      showError("Network error — is the server still running on this Wi-Fi?");
    } finally {
      loading(retrieveBtn, false);
    }
  }

  retrieveBtn.addEventListener("click", doRetrieve);

  // copy retrieved text
  $("#btn-copy-text").addEventListener("click", async () => {
    const ok = await copyText($("#retrieved-text").textContent);
    toast(ok ? "Copied!" : "Could not copy.", ok ? "success" : "error");
  });

  $("#btn-download").addEventListener("click", () => toast("Downloading…", "success"));
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initSharePage();
  initRetrievePage();
});
