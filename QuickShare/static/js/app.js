/* ================================================================
   QuickShare — client-side logic (vanilla JavaScript, no frameworks)
   ----------------------------------------------------------------
   Works over both local Wi-Fi / LAN and cross-network (Internet).
   ================================================================ */

const API = {
  shareText: "/api/share/text",
  shareFile: "/api/share/file",
  retrieve: "/api/retrieve",
  network: "/api/network",
  info: "/api/info",
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

let serverNetworkState = {
  lanUrl: document.documentElement.dataset.lanUrl || "",
  publicUrl: document.documentElement.dataset.publicUrl || "",
};

async function syncNetworkInfo() {
  try {
    const res = await fetch(API.network);
    if (res.ok) {
      const data = await res.json();
      if (data.lan_url) serverNetworkState.lanUrl = data.lan_url;
      if (data.public_url) serverNetworkState.publicUrl = data.public_url;
    }
  } catch {}
}

function isCloudDomain() {
  const hostname = window.location.hostname;
  return Boolean(hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "0.0.0.0" && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname));
}

function getBaseUrl(mode = "public") {
  // If hosted on a cloud domain (e.g. *.onrender.com, *.trycloudflare.com, etc.)
  if (isCloudDomain()) {
    return window.location.origin;
  }
  if (mode === "lan") {
    return serverNetworkState.lanUrl || window.location.origin;
  }
  if (serverNetworkState.publicUrl && serverNetworkState.publicUrl !== "None" && !serverNetworkState.publicUrl.includes("127.0.0.1")) {
    return serverNetworkState.publicUrl;
  }
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || !hostname) {
    return serverNetworkState.lanUrl || window.location.origin;
  }
  return window.location.origin;
}

/**
 * Clean QR Code Renderer
 * Ensures only ONE single, crisp QR image is displayed with correct dimensions.
 */
function renderQr(container, text, size = 150) {
  if (typeof container === "string") container = $(container);
  if (!container || typeof QRCode === "undefined") return;
  
  // Empty container completely before rendering
  container.innerHTML = "";

  try {
    new QRCode(container, {
      text: text,
      width: size,
      height: size,
      colorDark: "#0a0e1f",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (err) {
    console.error("QR render error:", err);
  }
}

function extractCode(text) {
  if (!text) return "";
  const trimmed = text.trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  const codeParamMatch = trimmed.match(/[?&]code=(\d{6})/i);
  if (codeParamMatch) return codeParamMatch[1];
  const shortRouteMatch = trimmed.match(/\/[rq]\/(\d{6})/i);
  if (shortRouteMatch) return shortRouteMatch[1];
  const generalMatch = trimmed.match(/\b(\d{6})\b/);
  return generalMatch ? generalMatch[1] : "";
}

/* ================================================================
   MOBILE CONNECT MODAL
   ================================================================ */
function initMobileModal() {
  const modal = $("#mobile-modal");
  const openBtn = $("#btn-open-mobile-modal");
  const closeBtn = $("#btn-close-mobile-modal");
  const copyLanBtn = $("#btn-copy-lan-url");
  const qrBox = $("#mobile-connect-qr");
  const lanUrlEl = $("#mobile-lan-url");
  const hintText = $("#network-hint-text");
  const modalToggle = $("#modal-net-toggle");

  if (!modal || !openBtn) return;

  let currentMode = serverNetworkState.publicUrl ? "public" : "lan";

  function refreshModalView() {
    const url = getBaseUrl(currentMode);
    if (lanUrlEl) lanUrlEl.textContent = url;
    if (qrBox) renderQr(qrBox, url, 150);
    if (hintText) {
      if (isCloudDomain()) {
        hintText.textContent = "🌐 24/7 Cloud Hosted · Connect from any network";
      } else {
        hintText.textContent = currentMode === "public"
          ? "🌐 Cross-network public URL (works on 4G/5G and any Wi-Fi)"
          : "📶 Local Wi-Fi address (devices must be on the same Wi-Fi)";
      }
    }
  }

  const openModal = async () => {
    await syncNetworkInfo();
    modal.classList.remove("hidden");
    
    if (modalToggle) {
      if (isCloudDomain()) {
        modalToggle.classList.add("hidden");
        currentMode = "public";
      } else {
        modalToggle.classList.remove("hidden");
        const publicBtn = $("#btn-modal-net-public");
        const lanBtn = $("#btn-modal-net-lan");
        if (serverNetworkState.publicUrl) {
          currentMode = "public";
          if (publicBtn) publicBtn.classList.add("active");
          if (lanBtn) lanBtn.classList.remove("active");
        } else {
          currentMode = "lan";
          if (lanBtn) lanBtn.classList.add("active");
          if (publicBtn) publicBtn.classList.remove("active");
        }
      }
    }
    refreshModalView();
  };

  const closeModal = () => modal.classList.add("hidden");

  openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  if (modalToggle) {
    modalToggle.querySelectorAll(".net-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        modalToggle.querySelectorAll(".net-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentMode = pill.dataset.mode || "public";
        refreshModalView();
      });
    });
  }

  if (copyLanBtn) {
    copyLanBtn.addEventListener("click", async () => {
      const url = getBaseUrl(currentMode);
      const ok = await copyText(url);
      toast(ok ? "URL copied to clipboard!" : "Failed to copy.", ok ? "success" : "error");
    });
  }
}

/* ================================================================
   SHARE PAGE
   ================================================================ */
function initSharePage() {
  const tabs = document.querySelectorAll(".tab");
  const panelText = $("#panel-text");
  const panelFile = $("#panel-file");
  if (!panelText || !panelFile) return;

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

  const textInput = $("#text-input");
  const charCount = $("#char-count");
  textInput.addEventListener("input", () => {
    charCount.textContent = `${textInput.value.length.toLocaleString()} characters`;
  });

  // Share Text
  $("#btn-share-text").addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text) { toast("Please enter some text first.", "error"); return; }
    const btn = $("#btn-share-text");
    loading(btn, true);
    try {
      const res = await fetch(API.shareText, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      showResult(data, "Text shared! Scan QR or use the code.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      loading(btn, false);
    }
  });

  // Share File
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

  dropzone.addEventListener("click", (e) => {
    if (e.target !== fileInput && !fileInput.contains(e.target)) {
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      setFile(fileInput.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("drag"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      try { fileInput.files = e.dataTransfer.files; } catch {}
      setFile(file);
    }
  });

  shareFileBtn.addEventListener("click", () => {
    if (!selectedFile) { toast("Please choose a file first.", "error"); return; }

    const progress = $("#upload-progress");
    const bar = $("#upload-bar");
    progress.classList.remove("hidden");
    bar.style.width = "0%";
    loading(shareFileBtn, true);

    const form = new FormData();
    form.append("file", selectedFile, selectedFile.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API.shareFile, true);
    xhr.timeout = 180000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        bar.style.width = percent + "%";
      }
    };
    xhr.onload = () => {
      loading(shareFileBtn, false);
      progress.classList.add("hidden");
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.code) {
        showResult(data, "File uploaded! Scan QR or use the code.");
      } else {
        toast(data.error || `Upload failed (HTTP ${xhr.status}).`, "error");
      }
    };
    xhr.onerror = () => {
      loading(shareFileBtn, false);
      progress.classList.add("hidden");
      toast("Upload failed. Please check network connection.", "error");
    };
    xhr.ontimeout = () => {
      loading(shareFileBtn, false);
      progress.classList.add("hidden");
      toast("Upload timed out. Try a smaller file.", "error");
    };
    xhr.send(form);
  });

  // Result Rendering
  const result = $("#result");
  const codeDisplay = $("#code-display");
  const resultMeta = $("#result-meta");
  const resultExpiry = $("#result-expiry");
  const qrContainer = $("#share-qr-container");
  const copyLinkBtn = $("#btn-copy-link");
  const downloadQrBtn = $("#btn-download-qr");
  const netToggle = $("#share-net-toggle");
  let countdownTimer = null;
  let currentShareData = null;
  let currentNetworkMode = "public";

  function getShareUrl() {
    if (!currentShareData) return "";
    const base = getBaseUrl(currentNetworkMode);
    return `${base}/retrieve?code=${currentShareData.code}`;
  }

  function updateQrDisplay() {
    if (!currentShareData || !qrContainer) return;
    const shareUrl = getShareUrl();
    renderQr(qrContainer, shareUrl, 150);
  }

  function showResult(data, msg) {
    currentShareData = data;
    if (data.public_url) serverNetworkState.publicUrl = data.public_url;
    if (data.lan_url) serverNetworkState.lanUrl = data.lan_url;

    codeDisplay.textContent = data.code;
    resultMeta.textContent = data.type === "file"
      ? `${data.filename} · ${data.filesize_human}`
      : "Text ready to retrieve";

    // Set default mode
    currentNetworkMode = isCloudDomain() ? "public" : (serverNetworkState.publicUrl ? "public" : "lan");
    if (netToggle) {
      if (isCloudDomain()) {
        netToggle.classList.add("hidden");
      } else {
        netToggle.classList.remove("hidden");
        netToggle.querySelectorAll(".net-pill").forEach((p) => {
          p.classList.toggle("active", p.dataset.mode === currentNetworkMode);
        });
      }
    }

    updateQrDisplay();

    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(msg, "success");
    startCountdown(data.expires_at);
  }

  if (netToggle) {
    netToggle.querySelectorAll(".net-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        netToggle.querySelectorAll(".net-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        currentNetworkMode = pill.dataset.mode || "public";
        updateQrDisplay();
        toast(currentNetworkMode === "public" ? "Switched to Cross-Network QR (Internet)" : "Switched to Local Wi-Fi QR", "success");
      });
    });
  }

  function startCountdown(expiresAt) {
    clearInterval(countdownTimer);
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        resultExpiry.textContent = "This share has expired.";
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

  $("#btn-copy").addEventListener("click", async () => {
    const ok = await copyText(codeDisplay.textContent);
    toast(ok ? "Code copied to clipboard!" : "Could not copy — copy it manually.", ok ? "success" : "error");
  });

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", async () => {
      const shareUrl = getShareUrl();
      if (!shareUrl) return;
      const ok = await copyText(shareUrl);
      toast(ok ? "Share link copied to clipboard!" : "Failed to copy link.", ok ? "success" : "error");
    });
  }

  if (downloadQrBtn) {
    downloadQrBtn.addEventListener("click", () => {
      const img = qrContainer ? qrContainer.querySelector("img") : null;
      const canvas = qrContainer ? qrContainer.querySelector("canvas") : null;
      let dataUrl = "";
      if (img && img.src) {
        dataUrl = img.src;
      } else if (canvas) {
        dataUrl = canvas.toDataURL("image/png");
      }

      if (dataUrl) {
        const link = document.createElement("a");
        link.download = `quickshare-${codeDisplay.textContent}-qr.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast("QR code image saved!", "success");
      } else {
        toast("QR Code not ready.", "error");
      }
    });
  }

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
   RETRIEVE PAGE & CAMERA QR SCANNER
   ================================================================ */
function initRetrievePage() {
  const codeInput = $("#code-input");
  const retrieveBtn = $("#btn-retrieve");
  if (!codeInput || !retrieveBtn) return;

  const textResult = $("#text-result");
  const fileResult = $("#file-result");
  const errorResult = $("#error-result");
  const scanQrBtn = $("#btn-scan-qr");
  const scannerModal = $("#scanner-modal");
  const closeScannerBtn = $("#btn-close-scanner");

  let html5QrCodeScanner = null;

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

  async function doRetrieve(overrideCode) {
    const code = (overrideCode || codeInput.value).trim();
    if (code.length !== 6) { toast("Enter the full 6-digit code.", "error"); return; }
    if (codeInput.value !== code) codeInput.value = code;

    loading(retrieveBtn, true);
    try {
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
        $("#btn-download").setAttribute("href", data.download_url);
        fileResult.classList.remove("hidden");
        fileResult.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("File found! Tap download.", "success");
      }
    } catch (err) {
      showError("Network error — please check your internet or Wi-Fi connection.");
    } finally {
      loading(retrieveBtn, false);
    }
  }

  retrieveBtn.addEventListener("click", () => doRetrieve());

  $("#btn-copy-text").addEventListener("click", async () => {
    const ok = await copyText($("#retrieved-text").textContent);
    toast(ok ? "Copied!" : "Could not copy.", ok ? "success" : "error");
  });

  $("#btn-download").addEventListener("click", () => toast("Downloading…", "success"));

  // Camera QR Scanner Modal Logic
  async function startScanner() {
    if (typeof Html5Qrcode === "undefined") {
      toast("Scanner loading...", "error");
      return;
    }
    scannerModal.classList.remove("hidden");

    try {
      html5QrCodeScanner = new Html5Qrcode("qr-reader");
      const config = { fps: 10, qrbox: { width: 220, height: 220 } };

      await html5QrCodeScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          const code = extractCode(decodedText);
          if (code && code.length === 6) {
            stopScanner();
            toast(`QR Scanned: Code ${code}`, "success");
            codeInput.value = code;
            doRetrieve(code);
          } else {
            toast("Scanned QR is not a valid QuickShare code.", "error");
          }
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera scanner error:", err);
      toast("Could not access camera. Please check permissions.", "error");
      stopScanner();
    }
  }

  function stopScanner() {
    if (html5QrCodeScanner) {
      html5QrCodeScanner.stop().then(() => {
        html5QrCodeScanner.clear();
        html5QrCodeScanner = null;
      }).catch(() => {
        html5QrCodeScanner = null;
      });
    }
    scannerModal.classList.add("hidden");
  }

  if (scanQrBtn && scannerModal) {
    scanQrBtn.addEventListener("click", startScanner);
    if (closeScannerBtn) closeScannerBtn.addEventListener("click", stopScanner);

    scannerModal.addEventListener("click", (e) => {
      if (e.target === scannerModal) stopScanner();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !scannerModal.classList.contains("hidden")) stopScanner();
    });
  }

  // Auto-retrieve if code is in URL
  const urlParams = new URLSearchParams(window.location.search);
  const paramCode = urlParams.get("code") || codeInput.value;
  if (paramCode && /^\d{6}$/.test(paramCode.trim())) {
    codeInput.value = paramCode.trim();
    doRetrieve(paramCode.trim());
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  syncNetworkInfo();
  initMobileModal();
  initSharePage();
  initRetrievePage();
});
