// Global data storage
let useCaseDataStore = {};

// Function to generate a unique ID for each use case
function generateUniqueId(useCase) {
  // Create a simple hash from the use case name
  let hash = 0;
  const str = useCase["Use Case"] || "unknown";
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

// Store a use case in the data store
function storeUseCaseData(useCase) {
  const id = generateUniqueId(useCase);
  useCaseDataStore[id] = useCase;
  return id;
}

// Retrieve a use case from the data store
function getUseCaseData(id) {
  return useCaseDataStore[id] || null;
}

// Check if we are in a browser environment
const isBrowser = typeof window !== "undefined";

// Function to save data to storage (either localStorage in the browser or file in Node.js)
function saveDataToStorage() {
  if (isBrowser) {
    localStorage.setItem('useCaseDataStore', JSON.stringify(useCaseDataStore));
  } else {
    const fs = require('fs');
    const path = require('path');
    const dataFilePath = path.join(__dirname, 'data-store.json');
    fs.writeFileSync(dataFilePath, JSON.stringify(useCaseDataStore), 'utf8');
  }
}

// Function to load data from storage (either localStorage in the browser or file in Node.js)
function loadDataFromStorage() {
  if (isBrowser) {
    const storedData = localStorage.getItem('useCaseDataStore');
    if (storedData) {
      useCaseDataStore = JSON.parse(storedData);
    }
  } else {
    const fs = require('fs');
    const path = require('path');
    const dataFilePath = path.join(__dirname, 'data-store.json');
    if (fs.existsSync(dataFilePath)) {
      const storedData = fs.readFileSync(dataFilePath, 'utf8');
      useCaseDataStore = JSON.parse(storedData);
    }
  }
}

// Initialize by loading any existing data
loadDataFromStorage();

module.exports = {
  storeUseCaseData,
  getUseCaseData,
  saveDataToStorage,
  loadDataFromStorage
};
