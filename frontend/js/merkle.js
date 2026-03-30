import { CFG, ABI } from './config.js';
import { showToast } from './ui.js';

async function refreshMerkleTree() {
  if (!CFG.contract) {
    showToast("Set contract address in Config tab", "error");
    return;
  }

  const btn = document.getElementById("refreshMerkleBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const p = new ethers.providers.JsonRpcProvider(CFG.rpc);
    const contract = new ethers.Contract(CFG.contract, ABI, p);

    const [root, leafCount] = await Promise.all([
      contract.merkleRoot(),
      contract.getLeafCount()
    ]);

    document.getElementById("merkleEmpty").style.display = "none";
    document.getElementById("merkleContent").style.display = "block";
    document.getElementById("merkleProofCard").style.display = "block";

    document.getElementById("merkleRootDisplay").textContent = root;
    document.getElementById("merkleContractDisplay").textContent = CFG.contract;
    document.getElementById("merkleLeafCount").textContent = leafCount.toString();
    
    const depth = Math.ceil(Math.log2(Math.max(leafCount, 1))) + 1;
    document.getElementById("merkleTreeDepth").textContent = depth.toString();
    document.getElementById("merkleLastUpdate").textContent = new Date().toLocaleTimeString();

    const leaves = [];
    for (let i = 0; i < leafCount; i++) {
      const leaf = await contract.notarizedHashes(i);
      leaves.push(leaf);
    }

    const tree = buildMerkleTree(leaves);
    renderMerkleTree(tree, root);

    showToast("Merkle tree updated", "success");

  } catch (error) {
    console.error("Merkle tree error:", error);
    showToast("Error loading Merkle tree: " + error.message, "error");
    document.getElementById("merkleEmpty").style.display = "block";
    document.getElementById("merkleContent").style.display = "none";
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🔄 Refresh Tree";
  }
}

function buildMerkleTree(leaves) {
  if (leaves.length === 0) return null;
  
  const hash = (a, b) => {
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [a, b])
    );
  };

  let currentLevel = [...leaves];
  const levels = [currentLevel];

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : currentLevel[i];
      nextLevel.push(hash(left, right));
    }
    currentLevel = nextLevel;
    levels.push(currentLevel);
  }

  return levels;
}

function renderMerkleTree(tree, root) {
  const container = document.getElementById("merkleTree");
  container.innerHTML = "";

  if (!tree || tree.length === 0) {
    container.innerHTML = '<div class="empty-state">No notarized papers yet</div>';
    return;
  }

  const reversed = [...tree].reverse();
  
  reversed.forEach((level, levelIndex) => {
    const levelDiv = document.createElement("div");
    levelDiv.className = "merkle-level";
    
    const actualLevel = tree.length - 1 - levelIndex;
    
    level.forEach((node, nodeIndex) => {
      const nodeDiv = document.createElement("div");
      nodeDiv.className = "merkle-node";
      nodeDiv.title = node;
      
      if (actualLevel === 0) {
        nodeDiv.classList.add("root");
        nodeDiv.textContent = truncateHash(node) + " (ROOT)";
      } else if (actualLevel === tree.length - 1) {
        nodeDiv.classList.add("leaf");
        nodeDiv.textContent = truncateHash(node) + " #" + (nodeIndex + 1);
      } else {
        nodeDiv.textContent = truncateHash(node);
      }

      nodeDiv.onclick = () => highlightPath(nodeDiv, node);
      levelDiv.appendChild(nodeDiv);
    });

    container.appendChild(levelDiv);

    if (levelIndex < reversed.length - 1) {
      const connector = document.createElement("div");
      connector.className = "merkle-connector";
      container.appendChild(connector);
    }
  });
}

function truncateHash(hash) {
  if (!hash || hash.length < 16) return hash || "";
  return hash.slice(0, 8) + "..." + hash.slice(-6);
}

function highlightPath(nodeDiv, hash) {
  document.querySelectorAll(".merkle-node").forEach(n => n.classList.remove("highlighted"));
  nodeDiv.classList.add("highlighted");
  
  showToast("Hash: " + hash, "info");
}

function expandAllNodes() {
  document.querySelectorAll(".merkle-node").forEach(n => {
    n.style.maxWidth = "none";
    n.style.overflow = "visible";
    n.style.whiteSpace = "normal";
  });
  
  setTimeout(() => {
    document.querySelectorAll(".merkle-node").forEach(n => {
      if (!n.classList.contains("highlighted")) {
        n.style.maxWidth = "120px";
        n.style.overflow = "hidden";
        n.style.whiteSpace = "nowrap";
      }
    });
  }, 3000);
  
  showToast("Nodes expanded for 3 seconds", "info");
}

function copyMerkleRoot() {
  const root = document.getElementById("merkleRootDisplay").textContent;
  navigator.clipboard?.writeText(root);
  showToast("Merkle root copied!", "success");
}

async function verifyMerkleProof() {
  const leafHash = document.getElementById("proofLeafHash").value.trim();
  const resultDiv = document.getElementById("proofResult");

  if (!leafHash) {
    resultDiv.innerHTML = '<div style="color: var(--error);">Please enter a leaf hash</div>';
    return;
  }

  if (!CFG.contract) {
    resultDiv.innerHTML = '<div style="color: var(--error);">Contract not configured</div>';
    return;
  }

  resultDiv.innerHTML = '<div style="color: var(--muted);">Verifying...</div>';

  try {
    const p = new ethers.providers.JsonRpcProvider(CFG.rpc);
    const contract = new ethers.Contract(CFG.contract, ABI, p);
    
    const [root, leafCount] = await Promise.all([
      contract.merkleRoot(),
      contract.getLeafCount()
    ]);

    let found = false;
    for (let i = 0; i < leafCount; i++) {
      const leaf = await contract.notarizedHashes(i);
      if (leaf.toLowerCase() === leafHash.toLowerCase()) {
        found = true;
        break;
      }
    }

    if (found) {
      resultDiv.innerHTML = `
        <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 1rem;">
          <div style="color: var(--success); font-weight: 600; margin-bottom: 0.5rem;">✓ Leaf Found in Tree</div>
          <div style="font-size: 0.8rem; color: var(--muted);">This paper has been notarized and is part of the Merkle tree.</div>
          <div style="margin-top: 0.5rem; font-size: 0.75rem;">
            <span style="color: var(--muted);">Root:</span> 
            <span style="color: var(--text);">${truncateHash(root)}</span>
          </div>
        </div>
      `;
      showToast("Leaf verified in Merkle tree", "success");
    } else {
      resultDiv.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 1rem;">
          <div style="color: var(--error); font-weight: 600; margin-bottom: 0.5rem;">✗ Leaf Not Found</div>
          <div style="font-size: 0.8rem; color: var(--muted);">This paper hash is not in the current Merkle tree.</div>
        </div>
      `;
      showToast("Leaf not found in tree", "error");
    }

  } catch (error) {
    console.error("Verify proof error:", error);
    resultDiv.innerHTML = `<div style="color: var(--error);">Error: ${error.message}</div>`;
    showToast("Verification error", "error");
  }
}

export { 
  refreshMerkleTree, buildMerkleTree, renderMerkleTree,
  truncateHash, highlightPath, expandAllNodes, copyMerkleRoot, verifyMerkleProof
};
