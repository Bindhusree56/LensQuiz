import { CFG, ABI } from './config.js';
import { store } from './store.js';
import { getProvider, getSigner, getWalletAddr } from './wallet.js';
import { refreshMerkleTree } from './merkle.js';
import { showToast } from './ui.js';

let currentFile = store.getState().currentFile;
let analysisData = store.getState().analysis;
let verifyFile = null;
let txHistory = store.getState().txHistory;

store.subscribe((prev, next) => {
  currentFile = next.currentFile;
  analysisData = next.analysis;
  txHistory = next.txHistory;
});

function addToTxHistory(txHash, blockNum, title) {
  store.addTx(txHash, blockNum, title);
  renderTxHistory();
}

function renderTxHistory() {
  const container = document.getElementById("txHistoryList");
  if (!container) return;
  
  const history = store.getState().txHistory;
  if (history.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.85rem;">No transactions yet</div>';
    return;
  }
  
  container.innerHTML = history.map(tx => `
    <div class="chain-row" style="flex-direction: column; align-items: flex-start; gap: 0.25rem;">
      <div style="color: var(--text); font-weight: 500;">${tx.title}</div>
      <div style="color: var(--muted); font-size: 0.75rem;">
        Block #${tx.blockNum} · ${tx.txHash.slice(0, 20)}...
      </div>
    </div>
  `).join("");
}

async function handleDrag(e, type) {
  e.preventDefault();
  const dropzone = document.getElementById("dropzone");
  if (type === "over") {
    dropzone.classList.add("dragover");
  } else if (type === "leave") {
    dropzone.classList.remove("dragover");
  } else if (type === "drop") {
    dropzone.classList.remove("dragover");
    loadFile(e.dataTransfer.files[0], false);
  }
}

async function handleVerifyDrag(e, type) {
  e.preventDefault();
  const dropzone = document.getElementById("verifyDropzone");
  if (type === "over") {
    dropzone.classList.add("dragover");
  } else if (type === "leave") {
    dropzone.classList.remove("dragover");
  } else if (type === "drop") {
    dropzone.classList.remove("dragover");
    loadFile(e.dataTransfer.files[0], true);
  }
}

function handleFileSelect(e) {
  loadFile(e.target.files[0], false);
}

function handleVerifyFile(e) {
  loadFile(e.target.files[0], true);
}

async function loadFile(file, isVerify) {
  if (!file) return;

  if (!isVerify) {
    store.setCurrentFile(file);
    document.getElementById("fileName").textContent = file.name;
    document.getElementById("fileMeta").textContent = formatSize(file.size) + " · " + file.name.split(".").pop().toUpperCase();
    document.getElementById("fileIcon").textContent = getFileIcon(file.name);
    document.getElementById("fileChip").style.display = "flex";
    document.getElementById("analyzeBtn").disabled = false;
  } else {
    verifyFile = file;
    document.getElementById("verifyFileName").textContent = file.name;
    document.getElementById("verifyFileMeta").textContent = formatSize(file.size);
    document.getElementById("verifyChip").style.display = "flex";
    
    const hash = await sha256File(file);
    document.getElementById("verifyHash").textContent = hash;
    document.getElementById("verifyHashBox").style.display = "block";
  }
}

function clearFile() {
  store.setCurrentFile(null);
  store.clearAnalysis();
  document.getElementById("fileChip").style.display = "none";
  document.getElementById("analyzeBtn").disabled = true;
  document.getElementById("resultsCard").style.display = "none";
  document.getElementById("chainCard").style.display = "none";
  document.getElementById("fileInput").value = "";
}

function clearVerifyFile() {
  verifyFile = null;
  document.getElementById("verifyChip").style.display = "none";
  document.getElementById("verifyHashBox").style.display = "none";
  document.getElementById("verifyResult").style.display = "none";
  document.getElementById("verifyFileInput").value = "";
}

function showLoadingSkeleton() {
  const resultsCard = document.getElementById("resultsCard");
  resultsCard.style.display = "block";
  resultsCard.innerHTML = `
    <div class="card-header">
      <div class="card-icon" style="background: rgba(168, 85, 247, 0.15)">🧠</div>
      <div class="card-title">Analysis Results</div>
    </div>
    <div class="skeleton-metrics">
      <div class="skeleton-metric"></div>
      <div class="skeleton-metric"></div>
      <div class="skeleton-metric"></div>
      <div class="skeleton-metric"></div>
      <div class="skeleton-metric"></div>
      <div class="skeleton-metric"></div>
    </div>
    <div class="skeleton-hash"></div>
    <div class="skeleton-hash"></div>
    <div class="skeleton-bars">
      <div class="skeleton-bar"></div>
      <div class="skeleton-bar"></div>
      <div class="skeleton-bar"></div>
    </div>
    <style>
      .skeleton-metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
      .skeleton-metric { height: 80px; background: var(--surface-2); border-radius: 12px; animation: pulse 1.5s infinite; }
      .skeleton-hash { height: 50px; background: var(--surface-2); border-radius: 10px; margin: 1rem 0; animation: pulse 1.5s infinite; }
      .skeleton-bar { height: 14px; background: var(--surface-2); border-radius: 7px; margin: 0.5rem 0; animation: pulse 1.5s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    </style>
  `;
}

async function runAnalysis() {
  const state = store.getState();
  if (state.currentFile) return;

  const btn = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("analyzeBtnText");
  const status = document.getElementById("nlpStatus");

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Analysing...';
  status.textContent = "Sending to NLP API...";
  status.className = "status";
  store.setAnalyzing(true);

  showLoadingSkeleton();

  const startTime = Date.now();

  try {
    const title = document.getElementById("examTitle").value || state.currentFile?.name || "Untitled";
    const formData = new FormData();
    formData.append("file", state.currentFile);
    formData.append("title", title);

    const response = await fetch(CFG.api + "/analyze", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    data._isDemo = false;
    
    store.setAnalysis(data);
    store.setAnalyzing(false);
    
    renderResults(data);
    
    document.getElementById("txHistoryCard").style.display = "block";
    document.getElementById("notarizeBtn").disabled = false;
    document.getElementById("notarizeBtn").title = "";
    
    renderTxHistory();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    status.textContent = "✅ Analysis complete in " + elapsed + "s";
    status.className = "status success";
    
    showToast("Analysis complete!", "success");

  } catch (error) {
    console.error("Analysis error:", error);
    status.textContent = "❌ " + error.message;
    status.className = "status error";
    store.setError(error.message);
    store.setAnalyzing(false);
    showToast("API Error: " + error.message, "error");
    
    showDemoData();
  } finally {
    btnText.innerHTML = "🔬 Run NLP Analysis";
    btn.disabled = false;
  }
}

function showDemoData() {
  const data = {
    _isDemo: true,
    title: document.getElementById("examTitle").value || "Demo Paper",
    question_count: 5,
    flesch_score: 52.3,
    flesch_grade: 9.1,
    readability_label: "Standard",
    avg_sentence_length: 18.4,
    overall_bloom: "apply",
    bias_summary: [],
    ambiguous_questions: [3],
    questions: [
      { index: 1, text: "Define recursion in programming.", bloom_level: "remember", bloom_confidence: "high", bias_flags: [] },
      { index: 2, text: "Explain the difference between an array and a linked list.", bloom_level: "understand", bloom_confidence: "high", bias_flags: [] },
      { index: 3, text: "Implement a binary search algorithm.", bloom_level: "apply", bloom_confidence: "high", bias_flags: [] },
      { index: 4, text: "Analyse the time complexity of quicksort.", bloom_level: "analyse", bloom_confidence: "high", bias_flags: [] },
      { index: 5, text: "Design a caching system for a web application.", bloom_level: "create", bloom_confidence: "medium", bias_flags: [] }
    ],
    paper_hash: "0x" + "a".repeat(64),
    report_hash: "0x" + "b".repeat(64),
    report_pdf_b64: null
  };
  
  store.setAnalysis(data);
  renderResults(data);
  document.getElementById("resultsCard").style.display = "block";
  
  const banner = document.createElement("div");
  banner.id = "demoBanner";
  banner.style.cssText = "background: rgba(239, 68, 68, 0.15); border: 1px solid var(--error); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; text-align: center; color: var(--error); font-weight: 600;";
  banner.innerHTML = "⚠️ DEMO DATA — NOT REAL. Upload a file to analyze real papers.";
  const resultsCard = document.getElementById("resultsCard");
  resultsCard.insertBefore(banner, resultsCard.firstChild);
  
  document.getElementById("notarizeBtn").disabled = true;
  document.getElementById("notarizeBtn").title = "Upload a real file to notarize";
  
  showToast("Showing demo data (NLP API not running)", "error");
}

function renderResults(d) {
  document.getElementById("resultsCard").innerHTML = `
    <div class="card-header">
      <div class="card-icon" style="background: rgba(168, 85, 247, 0.15)">🧠</div>
      <div class="card-title">Analysis Results</div>
    </div>

    <div class="metrics-grid" id="metricsGrid">
      ${metric("Questions", d.question_count, "")}
      ${metric("Flesch Score", d.flesch_score, d.readability_label)}
      ${metric("Grade Level", "G" + d.flesch_grade, "")}
      ${metric("Avg Sent", d.avg_sentence_length + "w", "")}
      ${metric("Top Bloom", d.overall_bloom, "")}
      ${metric("Bias Flags", d.bias_summary.length, d.bias_summary.length > 0 ? "⚠ Review" : "✓ None")}
    </div>

    <div class="hash-section">
      <div class="hash-label">Paper SHA-256</div>
      <div class="hash-box">
        <span id="paperHash">${d.paper_hash}</span>
        <button class="hash-copy" onclick="copyToClipboard('${d.paper_hash}')">Copy</button>
      </div>
    </div>

    <div class="hash-section">
      <div class="hash-label">Report SHA-256</div>
      <div class="hash-box">
        <span id="reportHash">${d.report_hash}</span>
        <button class="hash-copy" onclick="copyToClipboard('${d.report_hash}')">Copy</button>
      </div>
    </div>

    <div class="bloom-section">
      <div class="hash-label">Bloom's Taxonomy Distribution</div>
      <div id="bloomBars">${renderBloomBars(d)}</div>
    </div>

    <div id="biasSection" class="bias-tags">
      ${d.bias_summary?.length > 0 
        ? d.bias_summary.map(b => `<span class="bias-tag">${b}</span>`).join("") 
        : '<span class="no-bias">✓ No bias flags detected</span>'}
    </div>

    <div class="q-table">
      <div class="q-header">
        <div>#</div>
        <div>Question</div>
        <div>Bloom</div>
        <div>Bias</div>
        <div>Status</div>
      </div>
      <div id="qTable">
        ${d.questions.map(q => `
          <div class="q-row">
            <div class="q-num">Q${q.index}</div>
            <div class="q-text" title="${q.text}">${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}</div>
            <div><span class="bloom-pill bloom-${q.bloom_level}">${q.bloom_level}</span></div>
            <div class="q-status ${q.bias_flags?.length > 0 ? 'warn' : 'ok'}">
              ${q.bias_flags?.length > 0 ? "⚠" : "✓"}
            </div>
            <div class="q-status ${d.ambiguous_questions?.includes(q.index) ? 'warn' : ''}">
              ${d.ambiguous_questions?.includes(q.index) ? "⚠ Vague" : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="action-bar">
      <button class="btn btn-outline" onclick="downloadReport()">⬇ Download PDF</button>
      <button class="btn btn-green" id="notarizeBtn" onclick="notarize()">⛓ Notarize on Blockchain</button>
    </div>
    <div id="notarizeStatus" class="action-status"></div>
  `;

  if (d._isDemo) {
    const banner = document.createElement("div");
    banner.id = "demoBanner";
    banner.style.cssText = "background: rgba(239, 68, 68, 0.15); border: 1px solid var(--error); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; text-align: center; color: var(--error); font-weight: 600;";
    banner.innerHTML = "⚠️ DEMO DATA — NOT REAL. Upload a file to analyze real papers.";
    document.getElementById("resultsCard").insertBefore(banner, document.getElementById("resultsCard").firstChild);
    document.getElementById("notarizeBtn").disabled = true;
  }
}

function renderBloomBars(d) {
  const levels = ["remember", "understand", "apply", "analyse", "evaluate", "create"];
  const counts = {};
  levels.forEach(l => counts[l] = 0);
  d.questions.forEach(q => {
    if (counts[q.bloom_level] !== undefined) counts[q.bloom_level]++;
  });
  
  const maxCount = Math.max(...Object.values(counts), 1);
  const colors = {
    remember: "#64748b",
    understand: "#3b82f6",
    apply: "#22c55e",
    analyse: "#f59e0b",
    evaluate: "#a855f7",
    create: "#f43f5e"
  };

  return levels.map(level => `
    <div class="bloom-row">
      <div class="bloom-label">${level}</div>
      <div class="bloom-track">
        <div class="bloom-fill" style="width: ${(counts[level] / maxCount) * 100}%; background: ${colors[level]}"></div>
      </div>
      <div class="bloom-count">${counts[level]}</div>
    </div>
  `).join("");
}

function metric(label, value, sub) {
  return `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ""}
    </div>
  `;
}

async function notarize() {
  const state = store.getState();
  const data = state.analysis;
  
  if (!data) {
    showToast("Run analysis first", "error");
    return;
  }

  if (!CFG.contract) {
    showToast("Set contract address in Config tab", "error");
    return;
  }

  const signer = getSigner();
  if (!signer) {
    showToast("Connect MetaMask wallet first", "error");
    return;
  }

  if (data._isDemo) {
    showToast("Cannot notarize demo data. Upload a real file first.", "error");
    return;
  }

  const btn = document.getElementById("notarizeBtn");
  const status = document.getElementById("notarizeStatus");
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Waiting for MetaMask...';
  status.textContent = "";
  store.setNotarizing(true);

  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    const expectedChainId = parseInt(CFG.rpc.match(/:(\d+)$/)?.[1] || "1337");
    if (Number(network.chainId) !== expectedChainId) {
      throw new Error(`Wrong network. Please switch to chain ID ${expectedChainId} in MetaMask.`);
    }

    let txHash, blockNum, gasUsed;

    const contract = new ethers.Contract(CFG.contract, ABI, signer);
    
    const paperHash = data.paper_hash;
    const reportHash = data.report_hash;
    
    if (!paperHash || paperHash === "0x" || paperHash === "0x0") {
      throw new Error("Invalid paper hash");
    }
    
    const tx = await contract.notarize(paperHash, reportHash, data.title, { value: ethers.utils.parseEther("0.01") });
    showToast("TX sent: " + tx.hash.slice(0, 18) + "...", "info");
    
    const receipt = await tx.wait();
    txHash = receipt.transactionHash;
    blockNum = receipt.blockNumber;
    gasUsed = receipt.gasUsed?.toString();
    
    showToast("Confirmed in block #" + blockNum, "success");
    
    const walletAddr = getWalletAddr();
    addToTxHistory(txHash, blockNum, data.title);
    
    if (document.getElementById("tab-merkle").classList.contains("active")) {
      await refreshMerkleTree();
    }

    document.getElementById("chainRecord").innerHTML = `
      <div class="chain-row"><span class="chain-key">Status</span><span class="chain-val" style="color: #4ade80">✓ Confirmed</span></div>
      <div class="chain-row"><span class="chain-key">Exam</span><span class="chain-val">${data.title}</span></div>
      <div class="chain-row"><span class="chain-key">From</span><span class="chain-val">${walletAddr}</span></div>
      <div class="chain-row"><span class="chain-key">Contract</span><span class="chain-val">${CFG.contract.slice(0, 20)}...</span></div>
      <div class="chain-row"><span class="chain-key">Block</span><span class="chain-val">${blockNum}</span></div>
      <div class="chain-row"><span class="chain-key">Gas Used</span><span class="chain-val">${gasUsed}</span></div>
      <div class="chain-row"><span class="chain-key">TX Hash</span><span class="chain-val">${txHash.slice(0, 40)}...</span></div>
    `;
    document.getElementById("chainCard").style.display = "block";
    store.setNotarizing(false);

  } catch (error) {
    console.error("Notarize error:", error);
    let msg = error.message || "Transaction failed";
    if (msg.includes("user rejected") || error.code === 4001) {
      msg = "User rejected the transaction";
    }
    status.innerHTML = '<span style="color: var(--error)">❌ ' + msg + '</span>';
    store.setError(msg);
    store.setNotarizing(false);
    showToast(msg, "error");
  } finally {
    btn.innerHTML = "⛓ Notarize on Blockchain";
    btn.disabled = false;
  }
}

async function verifyChain() {
  if (!verifyFile || !CFG.contract) {
    showToast("Set contract address in Config", "error");
    return;
  }

  const resultEl = document.getElementById("verifyResult");
  const hash = document.getElementById("verifyHash").textContent;

  resultEl.style.display = "block";
  resultEl.innerHTML = '<div style="text-align: center; padding: 2rem;">Checking blockchain...</div>';

  try {
    let result = null;
    const provider = getProvider();

    if (provider) {
      const contract = new ethers.Contract(CFG.contract, ABI, provider);
      const paperHash = hash.padEnd(66, "0").slice(0, 66);
      result = await contract.verify(paperHash);
    } else {
      await sleep(1000);
    }

    const valid = result && result[0];

    if (valid) {
      resultEl.innerHTML = `
        <div style="color: var(--success); font-weight: 700; font-size: 1.1rem; margin-bottom: 1rem;">
          ✅ AUTHENTIC — Found on Blockchain
        </div>
        <div class="chain-row"><span class="chain-key">Setter</span><span class="chain-val">${result[1]}</span></div>
        <div class="chain-row"><span class="chain-key">Notarized</span><span class="chain-val">${new Date(result[3] * 1000).toLocaleString()}</span></div>
        <div class="chain-row"><span class="chain-key">Block #</span><span class="chain-val">${result[4]}</span></div>
        <div class="chain-row"><span class="chain-key">Title</span><span class="chain-val">${result[5]}</span></div>
        <div class="chain-row"><span class="chain-key">Report Hash</span><span class="chain-val">${result[2].slice(0, 40)}...</span></div>
      `;
      showToast("Paper verified authentic", "success");
    } else {
      resultEl.innerHTML = `
        <div style="color: var(--error); font-weight: 700; font-size: 1.1rem; margin-bottom: 1rem;">
          ❌ NOT FOUND — No on-chain record
        </div>
        <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 1rem;">
          This paper has not been notarized, or has been modified since notarization.
        </div>
        <div class="hash-box">${hash}</div>
      `;
      showToast("Paper not found on chain", "error");
    }
  } catch (error) {
    console.error("Verify error:", error);
    resultEl.innerHTML = `
      <div style="color: var(--error);">
        Verification error: ${error.message}
      </div>
    `;
    showToast("Verify error: " + error.message, "error");
  }
}

async function sha256File(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return "0x" + Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const icons = { pdf: "📑", docx: "📝", doc: "📝", txt: "📄" };
  return icons[ext] || "📄";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadReport() {
  const state = store.getState();
  if (!state.analysis?.report_pdf_b64) {
    showToast("No report available — start NLP API server", "error");
    return;
  }
  
  const binary = atob(state.analysis.report_pdf_b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "QuizLens_Report.pdf";
  a.click();
  URL.revokeObjectURL(url);
  
  showToast("Report downloaded", "success");
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copied to clipboard!", "success");
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    showToast("Copied to clipboard!", "success");
  } catch (err) {
    showToast("Failed to copy", "error");
  }
  document.body.removeChild(textarea);
}

function getAnalysisData() {
  return store.getState().analysis;
}

function getCurrentFile() {
  return store.getState().currentFile;
}

export { 
  currentFile, analysisData, verifyFile, txHistory,
  handleDrag, handleVerifyDrag, handleFileSelect, handleVerifyFile,
  loadFile, clearFile, clearVerifyFile, runAnalysis, showDemoData,
  renderResults, notarize, verifyChain, sha256File, formatSize, getFileIcon,
  sleep, downloadReport, copyToClipboard, getAnalysisData, getCurrentFile,
  showLoadingSkeleton
};
