import { CFG, ABI } from './config.js';
import { getProvider, getSigner, getWalletAddr, shortAddr } from './wallet.js';
import { refreshMerkleTree } from './merkle.js';

let currentFile = null;
let analysisData = null;
let verifyFile = null;
let txHistory = [];

function addToTxHistory(txHash, blockNum, title) {
  txHistory.unshift({
    txHash,
    blockNum,
    title,
    timestamp: Date.now()
  });
  renderTxHistory();
}

function renderTxHistory() {
  const container = document.getElementById("txHistoryList");
  if (!container) return;
  
  if (txHistory.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 0.85rem;">No transactions yet</div>';
    return;
  }
  
  container.innerHTML = txHistory.map(tx => `
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
    currentFile = file;
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
  currentFile = null;
  analysisData = null;
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

async function runAnalysis() {
  if (!currentFile) return;

  const btn = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("analyzeBtnText");
  const status = document.getElementById("nlpStatus");

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Analysing...';
  status.textContent = "Sending to NLP API...";
  status.className = "status";

  const startTime = Date.now();

  try {
    const title = document.getElementById("examTitle").value || currentFile.name;
    const formData = new FormData();
    formData.append("file", currentFile);
    formData.append("title", title);

    const response = await fetch(CFG.api + "/analyze", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    analysisData = await response.json();
    analysisData._isDemo = false;
    
    const demoBanner = document.getElementById("demoBanner");
    if (demoBanner) demoBanner.remove();
    
    renderResults(analysisData);
    
    document.getElementById("resultsCard").style.display = "block";
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
    showToast("API Error: " + error.message, "error");
    
    showDemoData();

  } finally {
    btnText.innerHTML = "🔬 Run NLP Analysis";
    btn.disabled = false;
  }
}

function showDemoData() {
  analysisData = {
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
  
  renderResults(analysisData);
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
  document.getElementById("metricsGrid").innerHTML = `
    ${metric("Questions", d.question_count, "")}
    ${metric("Flesch Score", d.flesch_score, d.readability_label)}
    ${metric("Grade Level", "G" + d.flesch_grade, "")}
    ${metric("Avg Sent", d.avg_sentence_length + "w", "")}
    ${metric("Top Bloom", d.overall_bloom, "")}
    ${metric("Bias Flags", d.bias_summary.length, d.bias_summary.length > 0 ? "⚠ Review" : "✓ None")}
  `;

  document.getElementById("paperHash").textContent = d.paper_hash;
  document.getElementById("reportHash").textContent = d.report_hash;

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

  document.getElementById("bloomBars").innerHTML = levels.map(level => `
    <div class="bloom-row">
      <div class="bloom-label">${level}</div>
      <div class="bloom-track">
        <div class="bloom-fill" style="width: ${(counts[level] / maxCount) * 100}%; background: ${colors[level]}"></div>
      </div>
      <div class="bloom-count">${counts[level]}</div>
    </div>
  `).join("");

  const biasSection = document.getElementById("biasSection");
  if (d.bias_summary && d.bias_summary.length > 0) {
    biasSection.innerHTML = d.bias_summary.map(b => `<span class="bias-tag">${b}</span>`).join("");
  } else {
    biasSection.innerHTML = '<span class="no-bias">✓ No bias flags detected</span>';
  }

  document.getElementById("qTable").innerHTML = d.questions.map(q => `
    <div class="q-row">
      <div class="q-num">Q${q.index}</div>
      <div class="q-text" title="${q.text}">${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}</div>
      <div><span class="bloom-pill bloom-${q.bloom_level}">${q.bloom_level}</span></div>
      <div class="q-status ${q.bias_flags && q.bias_flags.length > 0 ? 'warn' : 'ok'}">
        ${q.bias_flags && q.bias_flags.length > 0 ? "⚠" : "✓"}
      </div>
      <div class="q-status ${d.ambiguous_questions && d.ambiguous_questions.includes(q.index) ? 'warn' : ''}">
        ${d.ambiguous_questions && d.ambiguous_questions.includes(q.index) ? "⚠ Vague" : ""}
      </div>
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
  if (!analysisData) {
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

  if (analysisData._isDemo) {
    showToast("Cannot notarize demo data. Upload a real file first.", "error");
    return;
  }

  const btn = document.getElementById("notarizeBtn");
  const status = document.getElementById("notarizeStatus");
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Waiting for MetaMask...';
  status.textContent = "";

  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    const expectedChainId = parseInt(CFG.rpc.match(/:(\d+)$/)?.[1] || "1337");
    if (Number(network.chainId) !== expectedChainId) {
      throw new Error(`Wrong network. Please switch to chain ID ${expectedChainId} in MetaMask.`);
    }

    let txHash, blockNum, gasUsed;

    const contract = new ethers.Contract(CFG.contract, ABI, signer);
    
    const paperHash = analysisData.paper_hash;
    const reportHash = analysisData.report_hash;
    
    if (!paperHash || paperHash === "0x" || paperHash === "0x0") {
      throw new Error("Invalid paper hash");
    }
    
    const tx = await contract.notarize(paperHash, reportHash, analysisData.title, { value: ethers.utils.parseEther("0.01") });
    showToast("TX sent: " + tx.hash.slice(0, 18) + "...", "info");
    
    const receipt = await tx.wait();
    txHash = receipt.transactionHash;
    blockNum = receipt.blockNumber;
    gasUsed = receipt.gasUsed?.toString();
    
    showToast("Confirmed in block #" + blockNum, "success");
    
    const walletAddr = getWalletAddr();
    addToTxHistory(txHash, blockNum, analysisData.title);
    
    if (document.getElementById("tab-merkle").classList.contains("active")) {
      await refreshMerkleTree();
    }

    document.getElementById("chainRecord").innerHTML = `
      <div class="chain-row"><span class="chain-key">Status</span><span class="chain-val" style="color: #4ade80">✓ Confirmed</span></div>
      <div class="chain-row"><span class="chain-key">Exam</span><span class="chain-val">${analysisData.title}</span></div>
      <div class="chain-row"><span class="chain-key">From</span><span class="chain-val">${walletAddr}</span></div>
      <div class="chain-row"><span class="chain-key">Contract</span><span class="chain-val">${CFG.contract.slice(0, 20)}...</span></div>
      <div class="chain-row"><span class="chain-key">Block</span><span class="chain-val">${blockNum}</span></div>
      <div class="chain-row"><span class="chain-key">Gas Used</span><span class="chain-val">${gasUsed}</span></div>
      <div class="chain-row"><span class="chain-key">TX Hash</span><span class="chain-val">${txHash.slice(0, 40)}...</span></div>
    `;
    document.getElementById("chainCard").style.display = "block";

  } catch (error) {
    console.error("Notarize error:", error);
    let msg = error.message || "Transaction failed";
    if (msg.includes("user rejected") || error.code === 4001) {
      msg = "User rejected the transaction";
    }
    status.innerHTML = '<span style="color: var(--error)">❌ ' + msg + '</span>';
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
  if (!analysisData?.report_pdf_b64) {
    showToast("No report available — start NLP API server", "error");
    return;
  }
  
  const binary = atob(analysisData.report_pdf_b64);
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

function copyHash(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard?.writeText(text);
  showToast("Hash copied!");
}

function getAnalysisData() {
  return analysisData;
}

function getCurrentFile() {
  return currentFile;
}

export { 
  currentFile, analysisData, verifyFile, txHistory,
  handleDrag, handleVerifyDrag, handleFileSelect, handleVerifyFile,
  loadFile, clearFile, clearVerifyFile, runAnalysis, showDemoData,
  renderResults, notarize, verifyChain, sha256File, formatSize, getFileIcon,
  sleep, downloadReport, copyHash, getAnalysisData, getCurrentFile
};
