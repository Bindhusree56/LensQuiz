const STORAGE_KEY = "quizlens-state";

const initialState = {
  analysis: null,
  currentFile: null,
  txHistory: [],
  isAnalyzing: false,
  isNotarizing: false,
  error: null
};

function loadState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...initialState, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
  return { ...initialState };
}

function saveState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
}

class Store {
  constructor() {
    this.state = loadState();
    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  setState(updates) {
    const prev = this.state;
    this.state = { ...this.state, ...updates };
    saveState(this.state);
    this.notify(prev, this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(prev, next) {
    this.listeners.forEach(listener => listener(prev, next));
  }

  setAnalysis(data) {
    this.setState({ analysis: data, error: null });
  }

  clearAnalysis() {
    this.setState({ analysis: null });
  }

  setCurrentFile(file) {
    this.setState({ currentFile: file });
  }

  setAnalyzing(isAnalyzing) {
    this.setState({ isAnalyzing });
  }

  setNotarizing(isNotarizing) {
    this.setState({ isNotarizing });
  }

  setError(error) {
    this.setState({ error });
  }

  addTx(txHash, blockNum, title) {
    const txHistory = [
      { txHash, blockNum, title, timestamp: Date.now() },
      ...this.state.txHistory
    ].slice(0, 50);
    this.setState({ txHistory });
  }

  clearState() {
    sessionStorage.removeItem(STORAGE_KEY);
    this.state = { ...initialState };
    this.notify(this.state, this.state);
  }
}

const store = new Store();

export { store };
export default store;
