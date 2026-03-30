import { CFG } from './config.js';
import { refreshMerkleTree } from './merkle.js';

let toastTimeout;

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = type;
  toast.classList.add("show");
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

function switchTab(name, btn) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  btn.classList.add("active");
  
  if (name === "merkle" && CFG.contract) {
    refreshMerkleTree();
  }
}

async function checkConnections() {
  try {
    const response = await fetch(CFG.api + "/", { method: "GET" });
    if (response.ok) {
      document.getElementById("apiDot").className = "connection-dot connected";
      document.getElementById("apiStatus").textContent = "Connected";
    } else {
      throw new Error("API returned " + response.status);
    }
  } catch (e) {
    document.getElementById("apiDot").className = "connection-dot error";
    document.getElementById("apiStatus").textContent = "Offline";
  }

  if (CFG.contract) {
    try {
      const p = new ethers.providers.JsonRpcProvider(CFG.rpc);
      await p.getNetwork();
      document.getElementById("chainDot").className = "connection-dot connected";
      document.getElementById("chainStatus").textContent = "Connected";
      document.getElementById("merkleContractDot").className = "connection-dot connected";
      document.getElementById("merkleChainDot").className = "connection-dot connected";
    } catch (e) {
      document.getElementById("chainDot").className = "connection-dot error";
      document.getElementById("chainStatus").textContent = "Error";
      document.getElementById("merkleContractDot").className = "connection-dot error";
      document.getElementById("merkleChainDot").className = "connection-dot error";
    }
  } else {
    document.getElementById("chainDot").className = "connection-dot";
    document.getElementById("chainStatus").textContent = "Not configured";
  }

  if (!CFG.contract) {
    document.getElementById("configBadge").style.display = "inline";
  } else {
    document.getElementById("configBadge").style.display = "none";
  }
}

async function testApi() {
  const status = document.getElementById("configStatus");
  status.textContent = "Testing...";

  CFG.api = document.getElementById("cfgApi").value.trim();

  try {
    const response = await fetch(CFG.api + "/");
    const data = await response.json();
    status.innerHTML = '<span style="color: var(--success)">✅ NLP API: ' + data.message + '</span>';
    document.getElementById("apiDot").className = "connection-dot connected";
    document.getElementById("apiStatus").textContent = "Connected";
  } catch (error) {
    status.innerHTML = '<span style="color: var(--error)">❌ Cannot reach NLP API at ' + CFG.api + '</span>';
    document.getElementById("apiDot").className = "connection-dot error";
    document.getElementById("apiStatus").textContent = "Offline";
  }
}

async function testChain() {
  const status = document.getElementById("configStatus");
  status.textContent = "Testing connection...";

  CFG.rpc = document.getElementById("cfgRpc").value.trim();
  CFG.contract = document.getElementById("cfgContract").value.trim();

  try {
    const p = new ethers.providers.JsonRpcProvider(CFG.rpc);
    const net = await p.getNetwork();
    const block = await p.getBlockNumber();
    
    let contractInfo = "";
    if (CFG.contract) {
      try {
        const contract = new ethers.Contract(CFG.contract, [
          "function merkleRoot() external view returns (bytes32)",
          "function getLeafCount() external view returns (uint256)"
        ], p);
        const root = await contract.merkleRoot();
        const leafCount = await contract.getLeafCount();
        contractInfo = ` | Contract: ${leafCount} leaves`;
      } catch (e) {
        contractInfo = " (contract not verified)";
      }
    }
    
    status.innerHTML = `<span style="color: var(--success)">✅ Connected — Chain ${net.chainId}, Block #${block}${contractInfo}</span>`;
    document.getElementById("chainDot").className = "connection-dot connected";
    document.getElementById("chainStatus").textContent = "Connected";
  } catch (error) {
    status.innerHTML = `<span style="color: var(--error)">❌ Cannot reach node at ${CFG.rpc}</span>`;
    document.getElementById("chainDot").className = "connection-dot error";
    document.getElementById("chainStatus").textContent = "Error";
  }
}

function loadConfig() {
  const saved = localStorage.getItem("quizlens-config");
  if (saved) {
    try {
      const config = JSON.parse(saved);
      document.getElementById("cfgApi").value = config.api || "http://localhost:8000";
      document.getElementById("cfgContract").value = config.contract || "";
      document.getElementById("cfgRpc").value = config.rpc || "http://127.0.0.1:8545";
      
      CFG.api = config.api || CFG.api;
      CFG.contract = config.contract || CFG.contract;
      CFG.rpc = config.rpc || CFG.rpc;
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }
  checkConnections();
  showToast("Configuration loaded", "info");
}

function clearSavedConfig() {
  localStorage.removeItem("quizlens-config");
  document.getElementById("savedApi").textContent = "-";
  document.getElementById("savedContract").textContent = "-";
  document.getElementById("savedRpc").textContent = "-";
  document.getElementById("savedTime").textContent = "Never";
  showToast("Saved configuration cleared", "info");
}

export { showToast, switchTab, checkConnections, testApi, testChain, loadConfig, clearSavedConfig };
