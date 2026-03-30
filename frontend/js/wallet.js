let provider = null;
let signer = null;
let walletAddr = null;

async function connectWallet() {
  const btn = document.getElementById("connectBtn");
  
  if (typeof window.ethereum === "undefined") {
    showToast("MetaMask not found. Please install MetaMask extension.", "error");
    return;
  }

  try {
    btn.innerHTML = '<span class="spinner"></span> Connecting...';
    btn.disabled = true;

    const accounts = await window.ethereum.request({ 
      method: "eth_requestAccounts" 
    });

    if (accounts.length === 0) {
      throw new Error("No accounts found");
    }

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    walletAddr = await signer.getAddress();

    const network = await provider.getNetwork();
    updateNetworkBadge(network.chainId);

    btn.textContent = "✅ " + shortAddr(walletAddr);
    btn.classList.add("connected");
    
    const walletBadge = document.getElementById("walletBadge");
    walletBadge.textContent = shortAddr(walletAddr);
    walletBadge.style.display = "inline";

    showToast("Wallet connected: " + shortAddr(walletAddr), "success");

  } catch (error) {
    console.error("Wallet connection error:", error);
    let msg = "Connection failed";
    if (error.code === 4001) {
      msg = "User rejected the connection request";
    } else if (error.message) {
      msg = error.message;
    }
    showToast(msg, "error");
    btn.textContent = "🦊 Connect MetaMask";
  } finally {
    btn.disabled = false;
  }
}

function updateNetworkBadge(chainId) {
  const badge = document.getElementById("netBadge");
  badge.style.display = "inline";
  
  if (chainId === 1337 || chainId === 5777 || chainId === 31337) {
    badge.textContent = "🟡 Ganache";
    badge.className = "net-badge ganache";
  } else {
    badge.textContent = "❌ Wrong Network";
    badge.className = "net-badge error";
  }
}

function shortAddr(addr) {
  return addr ? addr.slice(0, 8) + "..." + addr.slice(-6) : "";
}

function getProvider() {
  return provider;
}

function getSigner() {
  return signer;
}

function getWalletAddr() {
  return walletAddr;
}

export { connectWallet, updateNetworkBadge, shortAddr, getProvider, getSigner, getWalletAddr };
