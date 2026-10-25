/* COJURIS — CONFIGURAÇÃO DO FIREBASE */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ⚠️ COLE AQUI O SEU firebaseConfig COPIADO DO CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyD_hdanmFCWh3W3eRoAvg8FVfF-_rPAybQ",
  authDomain: "cojuris.firebaseapp.com",
  projectId: "cojuris",
  storageBucket: "cojuris.firebasestorage.app",
  messagingSenderId: "153347283334",
  appId: "1:153347283334:web:4b776ac09de864ba5fb407"
};

// Inicialização única
const app = initializeApp(firebaseConfig);

// Exportações reutilizáveis
export const auth = getAuth(app);
export const db = getFirestore(app);