import { CFG, loadSavedConfig, saveConfig, validateApiUrl, validateContractAddress, validateRpcUrl } from './config.js';
import { connectWallet } from './wallet.js';
import { showToast, switchTab, checkConnections, testApi, testChain, loadConfig, clearSavedConfig } from './ui.js';
import { refreshMerkleTree, expandAllNodes, copyMerkleRoot, verifyMerkleProof } from './merkle.js';
import { 
  handleDrag, handleVerifyDrag, handleFileSelect, handleVerifyFile,
  clearFile, clearVerifyFile, runAnalysis, notarize, verifyChain, downloadReport
} from './analysis.js';

function initEventListeners() {
  document.getElementById('connectBtn').addEventListener('click', connectWallet);
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName, tab);
    });
  });
  
  document.querySelectorAll('.dropzone').forEach(dropzone => {
    const dragType = dropzone.dataset.drag;
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragType === 'analyse') handleDrag(e, 'over');
      else if (dragType === 'verify') handleVerifyDrag(e, 'over');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      if (dragType === 'analyse') handleDrag(e, 'leave');
      else if (dragType === 'verify') handleVerifyDrag(e, 'leave');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragType === 'analyse') handleDrag(e, 'drop');
      else if (dragType === 'verify') handleVerifyDrag(e, 'drop');
    });
  });
  
  document.querySelectorAll('input[type="file"]').forEach(input => {
    const fileType = input.dataset.fileSelect;
    if (fileType === 'analyse') input.addEventListener('change', handleFileSelect);
    else if (fileType === 'verify') input.addEventListener('change', handleVerifyFile);
  });
  
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      
      switch (action) {
        case 'connect':
          connectWallet();
          break;
        case 'runAnalysis':
          runAnalysis();
          break;
        case 'clearFile':
          clearFile();
          break;
        case 'clearVerifyFile':
          clearVerifyFile();
          break;
        case 'notarize':
          notarize();
          break;
        case 'verifyChain':
          verifyChain();
          break;
        case 'downloadReport':
          downloadReport();
          break;
        case 'copyHash':
          const targetId = btn.dataset.target;
          if (targetId) {
            const text = document.getElementById(targetId).textContent;
            navigator.clipboard?.writeText(text);
            showToast('Hash copied!');
          }
          break;
        case 'refreshMerkle':
          refreshMerkleTree();
          break;
        case 'expandAllNodes':
          expandAllNodes();
          break;
        case 'copyMerkleRoot':
          copyMerkleRoot();
          break;
        case 'verifyMerkleProof':
          verifyMerkleProof();
          break;
        case 'testApi':
          testApi();
          break;
        case 'testChain':
          testChain();
          break;
        case 'saveConfig':
          saveConfig();
          break;
        case 'loadConfig':
          loadConfig();
          break;
        case 'clearSavedConfig':
          clearSavedConfig();
          break;
      }
    });
  });
  
  document.querySelectorAll('[data-validate]').forEach(input => {
    const validateType = input.dataset.validate;
    
    input.addEventListener('input', () => {
      switch (validateType) {
        case 'api':
          validateApiUrl(input);
          break;
        case 'contract':
          validateContractAddress(input);
          break;
        case 'rpc':
          validateRpcUrl(input);
          break;
      }
    });
  });
}

window.addEventListener('load', async () => {
  loadSavedConfig();
  
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => location.reload());
    window.ethereum.on('chainChanged', () => location.reload());
  }
  
  if (CFG.contract) {
    document.getElementById('cfgContract').value = CFG.contract;
    validateContractAddress(document.getElementById('cfgContract'));
    showToast('Contract address auto-loaded', 'success');
  }
  
  initEventListeners();
  await checkConnections();
});

export { checkConnections };
