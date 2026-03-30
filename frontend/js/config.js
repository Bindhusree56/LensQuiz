const CFG = {
  api: "http://localhost:8000",
  contract: "",
  rpc: "http://127.0.0.1:8545"
};

const ABI = [
  "function notarize(bytes32 paperHash, bytes32 reportHash, string calldata title) external payable",
  "function verify(bytes32 paperHash) external view returns (bool valid, address setter, bytes32 reportHash, uint256 timestamp, uint256 blockNumber, string memory title)",
  "function merkleRoot() external view returns (bytes32)",
  "function getLeafCount() external view returns (uint256)",
  "function notarizedHashes(uint256) external view returns (bytes32)"
];

function loadSavedConfig() {
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

      updateSavedConfigDisplay(config);
      validateApiUrl(document.getElementById("cfgApi"));
      if (CFG.contract) validateContractAddress(document.getElementById("cfgContract"));
      validateRpcUrl(document.getElementById("cfgRpc"));
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }
}

function saveConfig() {
  const api = document.getElementById("cfgApi").value.trim();
  const contract = document.getElementById("cfgContract").value.trim();
  const rpc = document.getElementById("cfgRpc").value.trim();

  if (!validateApiUrl(document.getElementById("cfgApi"))) {
    showToast("Please fix API URL", "error");
    return;
  }

  if (contract && !validateContractAddress(document.getElementById("cfgContract"))) {
    showToast("Please fix contract address", "error");
    return;
  }

  if (!validateRpcUrl(document.getElementById("cfgRpc"))) {
    showToast("Please fix RPC URL", "error");
    return;
  }

  const config = {
    api,
    contract,
    rpc,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem("quizlens-config", JSON.stringify(config));
  
  CFG.api = api;
  CFG.contract = contract;
  CFG.rpc = rpc;

  updateSavedConfigDisplay(config);
  checkConnections();
  showToast("Configuration saved!", "success");
}

function updateSavedConfigDisplay(config) {
  document.getElementById("savedApi").textContent = config.api || "-";
  document.getElementById("savedContract").textContent = config.contract || "-";
  document.getElementById("savedRpc").textContent = config.rpc || "-";
  document.getElementById("savedTime").textContent = config.savedAt 
    ? new Date(config.savedAt).toLocaleString() 
    : "Never";
}

function validateApiUrl(input) {
  const hint = document.getElementById("cfgApiHint");
  try {
    new URL(input.value);
    input.className = "";
    hint.textContent = "Valid URL format";
    hint.className = "field-hint success";
    return true;
  } catch (e) {
    if (input.value === "") {
      input.className = "";
      hint.textContent = "URL for NLP analysis service";
      hint.className = "field-hint";
    } else {
      input.className = "invalid";
      hint.textContent = "Invalid URL format";
      hint.className = "field-hint error";
    }
    return false;
  }
}

function validateContractAddress(input) {
  const hint = document.getElementById("cfgContractHint");
  const address = input.value.trim();
  
  if (address === "") {
    input.className = "";
    hint.textContent = "QuizLens smart contract on blockchain";
    hint.className = "field-hint";
    return false;
  }
  
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    input.className = "valid";
    hint.textContent = "Valid Ethereum address format";
    hint.className = "field-hint success";
    return true;
  } else {
    input.className = "invalid";
    hint.textContent = "Must be a valid Ethereum address (0x...)";
    hint.className = "field-hint error";
    return false;
  }
}

function validateRpcUrl(input) {
  const hint = document.getElementById("cfgRpcHint");
  try {
    new URL(input.value);
    input.className = "";
    hint.textContent = "Valid URL format";
    hint.className = "field-hint success";
    return true;
  } catch (e) {
    if (input.value === "") {
      input.className = "";
      hint.textContent = "Local blockchain node endpoint";
      hint.className = "field-hint";
    } else {
      input.className = "invalid";
      hint.textContent = "Invalid URL format";
      hint.className = "field-hint error";
    }
    return false;
  }
}

export { CFG, ABI, loadSavedConfig, saveConfig, validateApiUrl, validateContractAddress, validateRpcUrl };
